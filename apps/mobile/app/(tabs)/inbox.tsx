import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type InboxItem, type WorkflowDefinition } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { isOverdue } from "../../src/lib/sla";
import { colors } from "../../src/theme/colors";

export default function InboxScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;

  const [items, setItems] = useState<InboxItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [search, setSearch] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const q = search.trim();
    const path = q ? `/api/v1/inbox?q=${encodeURIComponent(q)}` : "/api/v1/inbox";
    const [inbox, wfs] = await Promise.all([
      apiFetch<InboxItem[]>(path, {}, token),
      apiFetch<WorkflowDefinition[]>("/api/v1/workflows?status=published", {}, token).catch(() => []),
    ]);
    setItems(inbox);
    setWorkflows(wfs);
    if (tablet && inbox.length && !selectedId) setSelectedId(inbox[0].request_id);
  }, [token, search, tablet, selectedId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (workflowFilter && item.workflow_name !== workflowFilter) return false;
      if (overdueOnly && !isOverdue(item.submitted_at)) return false;
      return true;
    });
  }, [items, workflowFilter, overdueOnly]);

  const list = (
    <>
      <TextInput
        style={styles.search}
        placeholder="Search ref#, workflow, originator…"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => load()}
        returnKeyType="search"
      />
      <View style={styles.filters}>
        <Pressable
          style={[styles.chip, !workflowFilter && styles.chipActive]}
          onPress={() => setWorkflowFilter("")}
        >
          <Text style={[styles.chipText, !workflowFilter && styles.chipTextActive]}>All</Text>
        </Pressable>
        {workflows.slice(0, 6).map((w) => (
          <Pressable
            key={w.id}
            style={[styles.chip, workflowFilter === w.name && styles.chipActive]}
            onPress={() => setWorkflowFilter(workflowFilter === w.name ? "" : w.name)}
          >
            <Text
              style={[styles.chipText, workflowFilter === w.name && styles.chipTextActive]}
              numberOfLines={1}
            >
              {w.name}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, overdueOnly && styles.chipOverdue]}
          onPress={() => setOverdueOnly(!overdueOnly)}
        >
          <Text style={[styles.chipText, overdueOnly && styles.chipTextActive]}>Overdue</Text>
        </Pressable>
      </View>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(i) => i.request_id}
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
        ListEmptyComponent={
          <EmptyState title="Inbox cleared" message="No pending approvals match your filters." />
        }
        renderItem={({ item }) => {
          const active = selectedId === item.request_id;
          const overdue = isOverdue(item.submitted_at);
          const body = (
            <Pressable
              style={[styles.card, active && styles.cardActive, overdue && styles.cardOverdue]}
              onPress={() => {
                if (tablet) setSelectedId(item.request_id);
                else router.push(`/approval/${item.request_id}`);
              }}
            >
              <View style={styles.cardTop}>
                <Text style={styles.ref}>{item.reference_number || "—"}</Text>
                {item.needs_claim ? (
                  <Text style={styles.claim}>Claim</Text>
                ) : overdue ? (
                  <Text style={styles.overdueTag}>Overdue</Text>
                ) : null}
              </View>
              <Text style={styles.title}>{item.workflow_name}</Text>
              <Text style={styles.meta}>
                {item.step_name} · {item.originator_name}
              </Text>
            </Pressable>
          );
          return tablet ? body : <Link href={`/approval/${item.request_id}`} asChild>{body}</Link>;
        }}
      />
    </>
  );

  if (tablet) {
    return (
      <View style={styles.split}>
        <View style={styles.splitList}>{list}</View>
        <View style={styles.splitDetail}>
          {selectedId ? (
            <Pressable style={styles.openDetail} onPress={() => router.push(`/approval/${selectedId}`)}>
              <Text style={styles.openDetailText}>Open approval →</Text>
            </Pressable>
          ) : (
            <EmptyState title="Select a request" message="Choose an item from the inbox list." />
          )}
        </View>
      </View>
    );
  }

  return <View style={styles.root}>{list}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  split: { flex: 1, flexDirection: "row" },
  splitList: { flex: 1, borderRightWidth: 1, borderRightColor: colors.border },
  splitDetail: { flex: 1, justifyContent: "center" },
  list: { flex: 1 },
  search: {
    margin: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 15,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 140,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOverdue: { borderColor: colors.warning },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.primary, borderWidth: 2 },
  cardOverdue: { borderLeftWidth: 4, borderLeftColor: colors.warning },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  ref: { fontSize: 12, fontWeight: "700", color: colors.primary },
  claim: { fontSize: 11, fontWeight: "600", color: colors.warning },
  overdueTag: { fontSize: 11, fontWeight: "600", color: colors.danger },
  title: { fontSize: 16, fontWeight: "600", marginTop: 4, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  openDetail: {
    margin: 24,
    padding: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: "center",
  },
  openDetailText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
