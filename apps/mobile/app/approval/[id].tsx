import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthContext";
import {
  apiFetch,
  type RequestDetail,
  type WorkflowEvent,
} from "../../src/api/client";
import { StatusBadge } from "../../src/components/StatusBadge";
import { colors } from "../../src/theme/colors";

export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError("");
    let d = await apiFetch<RequestDetail>(`/api/v1/requests/${id}`, {}, token);
    if (d.needs_claim) {
      d = await apiFetch<RequestDetail>(`/api/v1/requests/${id}/claim`, { method: "POST" }, token);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const ev = await apiFetch<WorkflowEvent[]>(`/api/v1/requests/${id}/events`, {}, token);
    setDetail(d);
    setEvents(ev);
  }, [token, id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  async function act(action: "approve" | "reject" | "return") {
    if (!token || !id) return;
    const labels = { approve: "Approve", reject: "Reject", return: "Return" };
    Alert.alert(labels[action], `Confirm ${action}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: labels[action],
        style: action === "approve" ? "default" : "destructive",
        onPress: async () => {
          setActing(true);
          setError("");
          try {
            await apiFetch(
              `/api/v1/requests/${id}/${action}`,
              {
                method: "POST",
                body: JSON.stringify({ comment: comment.trim() || null }),
              },
              token
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  }

  if (loading || !detail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const data = detail.request_data || {};
  const preview = Object.entries(data)
    .filter(([k]) => !k.startsWith("__"))
    .slice(0, 12);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        <Text style={styles.ref}>{detail.reference_number || "—"}</Text>
        <Text style={styles.wf}>{detail.workflow_name}</Text>
        <StatusBadge status={detail.status} />
        <Text style={styles.step}>
          {detail.current_step_name || detail.current_step || "—"}
        </Text>
        {detail.originator_name ? (
          <Text style={styles.meta}>From {detail.originator_name}</Text>
        ) : null}
        {detail.amount_preview ? (
          <Text style={styles.amount}>{detail.amount_preview}</Text>
        ) : null}
      </View>

      <Text style={styles.section}>Request details</Text>
      <View style={styles.card}>
        {preview.length === 0 ? (
          <Text style={styles.muted}>No form fields</Text>
        ) : (
          preview.map(([k, v]) => (
            <View key={k} style={styles.fieldRow}>
              <Text style={styles.fieldKey}>{k}</Text>
              <Text style={styles.fieldVal}>{String(v)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.section}>Timeline</Text>
      {events.map((e) => (
        <View key={e.id} style={styles.event}>
          <Text style={styles.eventLabel}>{e.event_label || e.event_type}</Text>
          {e.actor_name ? <Text style={styles.muted}>{e.actor_name}</Text> : null}
          <Text style={styles.muted}>{new Date(e.created_at).toLocaleString()}</Text>
        </View>
      ))}

      {detail.can_act || detail.can_approve ? (
        <>
          <Text style={styles.section}>Your decision</Text>
          <TextInput
            style={styles.comment}
            placeholder="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.approve]}
              onPress={() => act("approve")}
              disabled={acting}
            >
              <Text style={styles.btnText}>Approve</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.returnBtn]}
              onPress={() => act("return")}
              disabled={acting}
            >
              <Text style={styles.returnText}>Return</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.reject]}
              onPress={() => act("reject")}
              disabled={acting}
            >
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.muted}>You cannot act on this request right now.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  ref: { fontSize: 13, fontWeight: "700", color: colors.primary },
  wf: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 6 },
  step: { fontSize: 15, color: colors.muted, marginTop: 10 },
  meta: { fontSize: 14, color: colors.muted, marginTop: 4 },
  amount: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 12 },
  section: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldRow: { marginBottom: 10 },
  fieldKey: { fontSize: 12, color: colors.muted, textTransform: "capitalize" },
  fieldVal: { fontSize: 15, color: colors.text, marginTop: 2 },
  event: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  eventLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  comment: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: "top",
  },
  actions: { gap: 10, marginTop: 12 },
  btn: { borderRadius: 10, padding: 14, alignItems: "center" },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.danger },
  returnBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.warning },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  returnText: { color: colors.warning, fontSize: 16, fontWeight: "600" },
  error: { color: colors.danger, marginBottom: 12 },
});
