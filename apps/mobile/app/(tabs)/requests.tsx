import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type RequestSummary } from "../../src/api/client";
import { StatusBadge } from "../../src/components/StatusBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { colors } from "../../src/theme/colors";

const FILTERS = [
  { id: "active", label: "Active", statuses: "in_progress,returned" },
  { id: "approved", label: "Approved", statuses: "approved" },
  { id: "rejected", label: "Rejected", statuses: "rejected" },
  { id: "all", label: "All", statuses: "" },
] as const;

export default function RequestsScreen() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [rows, setRows] = useState<RequestSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const statusParam = useMemo(() => FILTERS.find((f) => f.id === filter)?.statuses ?? "", [filter]);

  const load = useCallback(async () => {
    if (!token) return;
    const path = statusParam
      ? `/api/v1/requests?status=${encodeURIComponent(statusParam)}`
      : "/api/v1/requests";
    setRows(await apiFetch<RequestSummary[]>(path, {}, token));
  }, [token, statusParam]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.tab, filter === f.id && styles.tabActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.tabText, filter === f.id && styles.tabTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
        ListEmptyComponent={<EmptyState title="No requests" message="Submit a new request from the Submit tab." />}
        renderItem={({ item }) => (
          <Link href={`/request/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.ref}>{item.reference_number || "—"}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.wf}>{item.workflow_name}</Text>
              {item.current_step_name ? (
                <Text style={styles.meta}>{item.current_step_name}</Text>
              ) : null}
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 12, fontWeight: "700", color: colors.primary },
  wf: { fontSize: 16, fontWeight: "600", marginTop: 6, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
});
