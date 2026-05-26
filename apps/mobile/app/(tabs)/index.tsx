import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import {
  apiFetch,
  type AnomalyFinding,
  type ExecutiveSummary,
  type InboxItem,
  type NotificationCount,
} from "../../src/api/client";
import { canAccessAnalytics } from "../../src/lib/roles";
import { colors } from "../../src/theme/colors";

export default function HomeScreen() {
  const { user, token } = useAuth();
  const [counts, setCounts] = useState<NotificationCount>({ unread: 0, inbox: 0 });
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [kpi, setKpi] = useState<ExecutiveSummary | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyFinding[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const showManager = canAccessAnalytics(user?.roles);

  const load = useCallback(async () => {
    if (!token) return;
    const tasks: Promise<unknown>[] = [
      apiFetch<NotificationCount>("/api/v1/notifications/unread-count", {}, token),
      apiFetch<InboxItem[]>("/api/v1/inbox", {}, token),
    ];
    if (showManager) {
      tasks.push(apiFetch<ExecutiveSummary>("/api/v1/analytics/executive", {}, token));
      tasks.push(apiFetch<{ findings: AnomalyFinding[] }>("/api/v1/analytics/anomalies", {}, token));
    }
    const results = await Promise.all(tasks);
    setCounts(results[0] as NotificationCount);
    setInbox((results[1] as InboxItem[]).slice(0, 5));
    if (showManager) {
      setKpi(results[2] as ExecutiveSummary);
      setAnomalies((results[3] as { findings: AnomalyFinding[] }).findings.slice(0, 3));
    }
  }, [token, showManager]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  const brand = user?.company_branding?.brand_color || colors.primary;

  return (
    <ScrollView
      style={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true);
        try { await load(); } finally { setRefreshing(false); }
      }} />}
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

      <View style={styles.quickRow}>
        <Link href="/submit" asChild>
          <Pressable style={styles.quick}>
            <Text style={styles.quickText}>＋ New request</Text>
          </Pressable>
        </Link>
        <Link href="/requests" asChild>
          <Pressable style={styles.quick}>
            <Text style={styles.quickText}>My requests</Text>
          </Pressable>
        </Link>
      </View>

      {showManager && kpi ? (
        <View style={styles.kpiPanel}>
          <Text style={styles.section}>Manager snapshot</Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiVal}>{kpi.total_requests}</Text>
              <Text style={styles.kpiLbl}>Total</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiVal}>{kpi.in_progress}</Text>
              <Text style={styles.kpiLbl}>In progress</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiVal}>{kpi.overdue_count}</Text>
              <Text style={styles.kpiLbl}>Overdue</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiVal}>{Math.round(kpi.sla_compliance_pct)}%</Text>
              <Text style={styles.kpiLbl}>SLA</Text>
            </View>
          </View>
          {anomalies.length > 0 ? (
            <View style={styles.anomalyBox}>
              <Text style={styles.anomalyTitle}>{anomalies.length} anomaly signal(s)</Text>
              {anomalies.map((a, i) => (
                <Text key={i} style={styles.anomalyLine}>
                  {a.message}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.section}>Recent inbox</Text>
      {inbox.length === 0 ? (
        <Text style={styles.empty}>Inbox cleared — great work.</Text>
      ) : (
        inbox.map((item) => (
          <Link key={item.request_id} href={`/approval/${item.request_id}`} asChild>
            <Pressable style={styles.row}>
              <Text style={styles.ref}>{item.reference_number || "—"}</Text>
              <Text style={styles.wf}>{item.workflow_name}</Text>
            </Pressable>
          </Link>
        ))
      )}
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
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "700", color: colors.primary },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 4 },
  quickRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  quick: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  quickText: { fontWeight: "600", color: colors.primary },
  kpiPanel: { marginHorizontal: 16, marginBottom: 16 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCell: {
    width: "47%",
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiVal: { fontSize: 22, fontWeight: "700", color: colors.text },
  kpiLbl: { fontSize: 12, color: colors.muted },
  anomalyBox: {
    marginTop: 12,
    backgroundColor: "#fffbeb",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  anomalyTitle: { fontWeight: "600", color: colors.warning, marginBottom: 6 },
  anomalyLine: { fontSize: 13, color: colors.text, marginBottom: 4 },
  section: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
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
  empty: { marginHorizontal: 16, color: colors.muted },
});
