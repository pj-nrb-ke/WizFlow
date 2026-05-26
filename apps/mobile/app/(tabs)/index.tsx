import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type InboxItem, type NotificationCount } from "../../src/api/client";
import { colors } from "../../src/theme/colors";

export default function HomeScreen() {
  const { user, token, logout } = useAuth();
  const [counts, setCounts] = useState<NotificationCount>({ unread: 0, inbox: 0 });
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [c, items] = await Promise.all([
      apiFetch<NotificationCount>("/api/v1/notifications/unread-count", {}, token),
      apiFetch<InboxItem[]>("/api/v1/inbox", {}, token),
    ]);
    setCounts(c);
    setInbox(items.slice(0, 5));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const brand = user?.company_branding?.brand_color || colors.primary;

  return (
    <ScrollView
      style={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.banner, { backgroundColor: brand }]}>
        <Text style={styles.greeting}>Hello, {user?.full_name?.split(" ")[0]}</Text>
        <Text style={styles.company}>{user?.company_name}</Text>
      </View>

      <View style={styles.statsRow}>
        <Link href="/inbox" asChild>
          <Pressable style={styles.statCard}>
            <Text style={styles.statValue}>{counts.inbox}</Text>
            <Text style={styles.statLabel}>Pending approvals</Text>
          </Pressable>
        </Link>
        <Link href="/notifications" asChild>
          <Pressable style={styles.statCard}>
            <Text style={styles.statValue}>{counts.unread}</Text>
            <Text style={styles.statLabel}>Unread alerts</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={styles.section}>Recent inbox</Text>
      {inbox.length === 0 ? (
        <Text style={styles.empty}>Inbox cleared — great work.</Text>
      ) : (
        inbox.map((item) => (
          <Link key={item.request_id} href={`/approval/${item.request_id}`} asChild>
            <Pressable style={styles.row}>
              <Text style={styles.ref}>{item.reference_number || "—"}</Text>
              <Text style={styles.wf}>{item.workflow_name}</Text>
              <Text style={styles.meta}>
                {item.step_name} · {item.originator_name}
              </Text>
            </Pressable>
          </Link>
        ))
      )}

      <Pressable style={styles.signOut} onPress={() => logout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: { padding: 24, paddingTop: 8 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff" },
  company: { fontSize: 14, color: "#e0e7ff", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12, padding: 16, marginTop: -20 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "700", color: colors.primary },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 4 },
  section: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ref: { fontSize: 12, fontWeight: "600", color: colors.primary },
  wf: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  empty: { marginHorizontal: 16, color: colors.muted, fontSize: 15 },
  signOut: { margin: 24, alignItems: "center" },
  signOutText: { color: colors.danger, fontSize: 15 },
});
