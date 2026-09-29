import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type WorkflowDefinition } from "../../src/api/client";
import { getFormFields } from "../../src/lib/formUtils";
import { colors } from "../../src/theme/colors";

function assigneeLabel(a?: { type?: string; value?: string; user_ids?: string[] }): string {
  if (!a) return "Approver";
  if (a.type === "users") return `${(a.user_ids || []).length} named approver(s)`;
  if (a.value === "manager") return "Manager";
  if (a.value === "company_admin") return "Finance / Admin";
  if (a.value === "approver") return "Approver";
  return a.value || "Approver";
}

export default function WorkflowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [wf, setWf] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setWf(await apiFetch<WorkflowDefinition>(`/api/v1/workflows/${id}`, {}, token));
  }, [token, id]);

  useEffect(() => {
    load()
      .catch(() => Alert.alert("Error", "Could not load workflow"))
      .finally(() => setLoading(false));
  }, [load]);

  if (loading || !wf) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const fields = getFormFields(wf.form_schema);
  const steps = wf.steps ?? [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      <Text style={styles.name}>{wf.name}</Text>
      <Text style={styles.meta}>
        v{wf.version ?? 1} · {wf.status}
      </Text>

      <Text style={styles.section}>Form preview</Text>
      {fields.length === 0 ? (
        <Text style={styles.muted}>No form fields.</Text>
      ) : (
        fields.map((f) => (
          <View key={f.key} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {f.label || f.key}
              {f.required ? " *" : ""}
            </Text>
            <Text style={styles.fieldType}>{f.type}</Text>
          </View>
        ))
      )}

      <Text style={styles.section}>Approval flow</Text>
      {steps.length === 0 ? (
        <Text style={styles.muted}>No approval steps.</Text>
      ) : (
        steps.map((s, i) => (
          <View key={s.id ?? i} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepName}>{s.name || `Step ${i + 1}`}</Text>
              <Text style={styles.muted}>{assigneeLabel(s.assignee)}</Text>
            </View>
          </View>
        ))
      )}

      <Pressable style={styles.btn} onPress={() => router.push(`/guest-submissions/${id}`)}>
        <Text style={styles.btnText}>Guest submissions</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  muted: { fontSize: 14, color: colors.muted },
  section: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 8,
  },
  fieldCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fieldLabel: { fontSize: 15, color: colors.text, flex: 1 },
  fieldType: { fontSize: 12, color: colors.muted, textTransform: "capitalize" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  stepName: { fontSize: 15, fontWeight: "600", color: colors.text },
  btn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
