import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthContext";
import { apiFetch, type WorkflowDefinition } from "../src/api/client";
import { colors } from "../src/theme/colors";

export default function WorkflowsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const list = await apiFetch<WorkflowDefinition[]>("/api/v1/workflows?status=published", {}, token);
    setItems(list);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => Alert.alert("Error", "Could not load workflows."))
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {items.length === 0 ? (
        <Text style={styles.muted}>No published workflows.</Text>
      ) : (
        items.map((w) => (
          <View key={w.id} style={styles.card}>
            <Text style={styles.name}>{w.name}</Text>
            <Text style={styles.meta}>v{w.version} • {w.status}</Text>
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
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});

