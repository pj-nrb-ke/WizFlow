import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import {
  apiFetch,
  type Attachment,
  type RequestDetail,
  type WorkflowDefinition,
  type WorkflowEvent,
} from "../../src/api/client";
import { FormRenderer } from "../../src/components/FormRenderer";
import { StatusBadge } from "../../src/components/StatusBadge";
import {
  buildInitialForm,
  formToPayload,
  getFormFields,
  validateForm,
} from "../../src/lib/formUtils";
import { buildRequestShareMessage } from "../../src/lib/share";
import { colors } from "../../src/theme/colors";

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fields, setFields] = useState<ReturnType<typeof getFormFields>>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const returned = detail?.status === "returned";
  const highlightKeys = useMemo(() => {
    if (!returned) return undefined;
    return new Set(fields.map((f) => f.key));
  }, [returned, fields]);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const [d, ev, atts] = await Promise.all([
      apiFetch<RequestDetail>(`/api/v1/requests/${id}`, {}, token),
      apiFetch<WorkflowEvent[]>(`/api/v1/requests/${id}/events`, {}, token),
      apiFetch<Attachment[]>(`/api/v1/requests/${id}/attachments`, {}, token),
    ]);
    setDetail(d);
    setEvents(ev);
    setAttachments(atts);
    if (d.status === "returned") {
      const wf = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${d.workflow_definition_id}`,
        {},
        token
      ).catch(() => null);
      if (wf) {
        const f = getFormFields(wf.form_schema);
        setFields(f);
        const data: Record<string, string> = {};
        for (const key of Object.keys(d.request_data || {})) {
          if (typeof d.request_data[key] === "string" || typeof d.request_data[key] === "number") {
            data[key] = String(d.request_data[key]);
          }
        }
        setForm(data);
      }
    }
  }, [token, id]);

  useEffect(() => {
    load()
      .catch(() => Alert.alert("Error", "Could not load request"))
      .finally(() => setLoading(false));
  }, [load]);

  async function resubmit() {
    if (!token || !id) return;
    const err = validateForm(fields, form);
    if (err) {
      Alert.alert("Form", err);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(
        `/api/v1/requests/${id}`,
        { method: "PATCH", body: JSON.stringify({ data: formToPayload(fields, form) }) },
        token
      );
      Alert.alert("Resubmitted", "Your corrections were sent for approval.");
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Resubmit failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !detail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      <View style={styles.hero}>
        <Text style={styles.ref}>{detail.reference_number || "—"}</Text>
        <Text style={styles.wf}>{detail.workflow_name}</Text>
        <StatusBadge status={detail.status} />
      </View>

      <Pressable
        style={styles.shareBtn}
        onPress={async () => {
          try {
            await Share.share({
              message: buildRequestShareMessage(detail.id, detail.reference_number),
            });
          } catch {
            /* ignore */
          }
        }}
      >
        <Text style={styles.shareText}>Share</Text>
      </Pressable>

      {returned ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Action required — update highlighted fields and resubmit.</Text>
        </View>
      ) : null}

      {!returned ? (
        <View style={styles.card}>
          {Object.entries(detail.request_data || {})
            .filter(([k]) => !k.startsWith("__"))
            .map(([k, v]) => (
              <View key={k} style={styles.fieldRow}>
                <Text style={styles.fieldKey}>{k}</Text>
                <Text style={styles.fieldVal}>{String(v)}</Text>
              </View>
            ))}
        </View>
      ) : (
        <>
          <FormRenderer
            fields={fields}
            values={form}
            onChange={(k, v) => setForm({ ...form, [k]: v })}
            highlightKeys={highlightKeys}
          />
          <Pressable style={styles.btn} onPress={resubmit} disabled={saving}>
            <Text style={styles.btnText}>{saving ? "Saving…" : "Resubmit request"}</Text>
          </Pressable>
        </>
      )}

      {attachments.length > 0 ? (
        <>
          <Text style={styles.section}>Attachments</Text>
          {attachments.map((a) => (
            <Text key={a.id} style={styles.attach}>
              {a.filename} ({Math.round(a.size_bytes / 1024)} KB)
            </Text>
          ))}
        </>
      ) : null}

      <Text style={styles.section}>Timeline</Text>
      {events.map((e) => (
        <View key={e.id} style={styles.event}>
          <Text style={styles.eventLabel}>{e.event_label || e.event_type}</Text>
          <Text style={styles.muted}>{new Date(e.created_at).toLocaleString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  ref: { fontSize: 12, fontWeight: "700", color: colors.primary },
  wf: { fontSize: 18, fontWeight: "700", marginTop: 4, color: colors.text },
  shareBtn: {
    marginTop: -2,
    marginBottom: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareText: { color: colors.primary, fontWeight: "700" },
  banner: { backgroundColor: "#ffedd5", padding: 12, borderRadius: 10, marginBottom: 12 },
  bannerText: { color: colors.warning, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  fieldRow: { marginBottom: 8 },
  fieldKey: { fontSize: 12, color: colors.muted },
  fieldVal: { fontSize: 15, color: colors.text },
  section: { fontSize: 12, fontWeight: "700", color: colors.muted, marginTop: 16, marginBottom: 8 },
  event: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  eventLabel: { fontSize: 14, fontWeight: "600" },
  muted: { fontSize: 12, color: colors.muted },
  attach: { fontSize: 14, color: colors.text, marginBottom: 4 },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
