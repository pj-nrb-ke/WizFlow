import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, extractDocument, type WorkflowDefinition } from "../../src/api/client";
import { FormRenderer } from "../../src/components/FormRenderer";
import {
  buildInitialForm,
  formToPayload,
  getFormFields,
  validateForm,
} from "../../src/lib/formUtils";
import { clearDraft, draftFromFields, enqueueSubmit, loadDraft, saveDraft } from "../../src/lib/offlineQueue";
import { useOfflineSync } from "../../src/hooks/useOfflineSync";
import { colors } from "../../src/theme/colors";

export default function SubmitScreen() {
  const { token } = useAuth();
  const { online, pending } = useOfflineSync(token);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState<ReturnType<typeof getFormFields>>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ocrHint, setOcrHint] = useState("");
  const [draftHint, setDraftHint] = useState("");

  const selected = workflows.find((w) => w.id === selectedId);

  const loadWorkflows = useCallback(async () => {
    if (!token) return;
    const list = await apiFetch<WorkflowDefinition[]>(
      "/api/v1/workflows?status=published&initiator_only=true",
      {},
      token
    );
    setWorkflows(list);
    if (list.length && !selectedId) {
      await pickWorkflow(list[0].id, list);
    }
  }, [token, selectedId]);

  async function pickWorkflow(id: string, list = workflows) {
    setSelectedId(id);
    if (!token) return;
    const wf = list.find((w) => w.id === id) || (await apiFetch<WorkflowDefinition>(`/api/v1/workflows/${id}`, {}, token));
    const f = getFormFields(wf.form_schema);
    setFields(f);
    const draft = await loadDraft(id);
    setForm(draft?.form ?? buildInitialForm(f));
    setDraftHint(draft ? `Draft restored` : "");
  }

  useEffect(() => {
    loadWorkflows().finally(() => setLoading(false));
  }, [loadWorkflows]);

  function onChange(key: string, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (selected) {
      void saveDraft(draftFromFields(selected.id, selected.name, fields, next));
      setDraftHint("Draft saved on device");
    }
  }

  async function pickDocument() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !token) return;
    const asset = result.assets[0];
    try {
      const data = await extractDocument(
        asset.uri,
        asset.fileName || "photo.jpg",
        asset.mimeType || "image/jpeg",
        token
      );
      const patch = { ...form };
      for (const field of data.fields) {
        if (fields.some((f) => f.key === field.key)) patch[field.key] = String(field.value);
      }
      setForm(patch);
      setOcrHint(data.message);
    } catch {
      setOcrHint("Could not extract fields — enter manually.");
    }
  }

  async function onSubmit() {
    if (!token || !selectedId) return;
    const err = validateForm(fields, form);
    if (err) {
      Alert.alert("Form", err);
      return;
    }
    const payload = formToPayload(fields, form);
    setSubmitting(true);
    try {
      if (!online) {
        await enqueueSubmit(selectedId, payload);
        Alert.alert("Saved offline", "Request will submit when you're back online.");
        await clearDraft(selectedId);
        return;
      }
      const inst = await apiFetch<{ id: string }>(
        `/api/v1/workflows/${selectedId}/submit`,
        { method: "POST", body: JSON.stringify({ data: payload }) },
        token
      );
      await clearDraft(selectedId);
      Alert.alert("Submitted", `Reference will appear in My Requests.`);
      setForm(buildInitialForm(fields));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {!online && (
        <Text style={styles.offline}>Offline — {pending} queued submission(s)</Text>
      )}
      {workflows.length === 0 ? (
        <Text style={styles.muted}>No workflows available for you to start.</Text>
      ) : (
        <>
          <Text style={styles.label}>Workflow</Text>
          <View style={styles.chips}>
            {workflows.map((w) => (
              <Pressable
                key={w.id}
                style={[styles.chip, selectedId === w.id && styles.chipActive]}
                onPress={() => pickWorkflow(w.id)}
              >
                <Text style={[styles.chipText, selectedId === w.id && styles.chipTextActive]}>
                  {w.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {draftHint ? <Text style={styles.hint}>{draftHint}</Text> : null}
          <FormRenderer fields={fields} values={form} onChange={onChange} />
          <Pressable style={styles.secondaryBtn} onPress={pickDocument}>
            <Text style={styles.secondaryText}>Scan receipt / invoice (camera)</Text>
          </Pressable>
          {ocrHint ? <Text style={styles.hint}>{ocrHint}</Text> : null}
          <Pressable style={styles.btn} onPress={onSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Submit request</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: "#fff" },
  hint: { fontSize: 13, color: colors.muted, marginVertical: 8 },
  offline: { color: colors.warning, marginBottom: 12, fontWeight: "600" },
  muted: { color: colors.muted },
  secondaryBtn: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  secondaryText: { color: colors.primary, fontWeight: "600" },
  btn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
