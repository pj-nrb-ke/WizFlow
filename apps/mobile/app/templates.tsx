import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { apiFetch, type WorkflowTemplateSummary } from "../src/api/client";
import { colors } from "../src/theme/colors";

export default function TemplatesScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<WorkflowTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await apiFetch<WorkflowTemplateSummary[]>("/api/v1/templates", {}, token);
    setItems(list);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => Alert.alert("Error", "Could not load templates."))
      .finally(() => setLoading(false));
  }, [load]);

  async function clone(templateId: string) {
    if (!token) return;
    try {
      const out = await apiFetch<{ workflow_id: string; name: string; status: string }>(
        `/api/v1/templates/${templateId}/clone`,
        { method: "POST" },
        token
      );
      Alert.alert("Cloned", `Created "${out.name}" as a draft workflow.\n\nOpen the web app to publish it.`);
    } catch (e) {
      Alert.alert("Clone failed", e instanceof Error ? e.message : "Could not clone template");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      <Text style={styles.help}>Templates can be cloned into draft workflows for your company.</Text>
      {items.length === 0 ? (
        <Text style={styles.muted}>No templates available.</Text>
      ) : (
        items.map((t) => (
          <View key={t.id} style={styles.card}>
            <Text style={styles.name}>{t.name}</Text>
            <Text style={styles.meta}>{t.category}</Text>
            <Text style={styles.desc}>{t.description}</Text>
            <View style={styles.row}>
              <Pressable style={styles.btn} onPress={() => clone(t.id)}>
                <Text style={styles.btnText}>Clone</Text>
              </Pressable>
              <Pressable style={styles.link} onPress={() => router.push("/workflows")}>
                <Text style={styles.linkText}>View workflows</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  help: { color: colors.muted, marginBottom: 12, lineHeight: 18 },
  muted: { color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4, textTransform: "uppercase" },
  desc: { color: colors.text, marginTop: 8, lineHeight: 19 },
  row: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },
  btn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  link: { paddingVertical: 10, paddingHorizontal: 12 },
  linkText: { color: colors.primary, fontWeight: "700" },
});

