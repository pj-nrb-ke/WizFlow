import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type InboxItem } from "../../src/api/client";
import { colors } from "../../src/theme/colors";

export default function InboxScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const q = search.trim();
    const path = q ? `/api/v1/inbox?q=${encodeURIComponent(q)}` : "/api/v1/inbox";
    const data = await apiFetch<InboxItem[]>(path, {}, token);
    setItems(data);
  }, [token, search]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  return (
    <View style={styles.root}>
      <TextInput
        style={styles.search}
        placeholder="Search ref#, workflow, originator…"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => load()}
        returnKeyType="search"
      />
      <FlatList
        data={items}
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
          <Text style={styles.empty}>No pending approvals in your inbox.</Text>
        }
        renderItem={({ item }) => (
          <Link href={`/approval/${item.request_id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.ref}>{item.reference_number || "—"}</Text>
                {item.needs_claim ? (
                  <View style={styles.claimBadge}>
                    <Text style={styles.claimText}>Claim</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.title}>{item.workflow_name}</Text>
              <Text style={styles.step}>{item.step_name}</Text>
              <Text style={styles.meta}>
                {item.originator_name}
                {item.amount_preview ? ` · ${item.amount_preview}` : ""}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: {
    margin: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 15,
  },
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 12, fontWeight: "700", color: colors.primary },
  claimBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  claimText: { fontSize: 11, fontWeight: "600", color: colors.warning },
  title: { fontSize: 17, fontWeight: "600", color: colors.text, marginTop: 6 },
  step: { fontSize: 14, color: colors.muted, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 6 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40, fontSize: 15 },
});
