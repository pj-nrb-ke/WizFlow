import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type GuestSubmission, type GuestSubmissionDetail } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { colors } from "../../src/theme/colors";

export default function GuestSubmissionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [rows, setRows] = useState<GuestSubmission[]>([]);
  const [detail, setDetail] = useState<Record<string, GuestSubmissionDetail>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setRows(await apiFetch<GuestSubmission[]>(`/api/v1/workflows/${id}/guest-submissions`, {}, token));
  }, [token, id]);

  useEffect(() => {
    load().catch(() => Alert.alert("Error", "Could not load submissions (manager/admin only)."));
  }, [load]);

  async function toggle(subId: string) {
    if (detail[subId]) {
      const cp = { ...detail };
      delete cp[subId];
      setDetail(cp);
      return;
    }
    if (!token || !id) return;
    try {
      const d = await apiFetch<GuestSubmissionDetail>(
        `/api/v1/workflows/${id}/guest-submissions/${subId}`,
        {},
        token
      );
      setDetail((m) => ({ ...m, [subId]: d }));
    } catch {
      /* ignore */
    }
  }

  async function accept(subId: string) {
    if (!token || !id) return;
    setBusyId(subId);
    try {
      await apiFetch(`/api/v1/workflows/${id}/guest-submissions/${subId}/accept`, { method: "POST" }, token);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject(subId: string) {
    if (!token || !id) return;
    if (!reason.trim()) {
      Alert.alert("Reason", "Enter a reason for rejecting.");
      return;
    }
    setBusyId(subId);
    try {
      await apiFetch(
        `/api/v1/workflows/${id}/guest-submissions/${subId}/reject`,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() }) },
        token
      );
      setRejectingId(null);
      setReason("");
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.pad}
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
      ListEmptyComponent={
        <EmptyState title="No guest submissions" message="Public-form submissions awaiting review show up here." />
      }
      renderItem={({ item }) => {
        const d = detail[item.id];
        const pending = item.status === "pending";
        return (
          <View style={styles.card}>
            <Pressable onPress={() => toggle(item.id)}>
              <View style={styles.rowBetween}>
                <Text style={styles.name}>{item.guest_name}</Text>
                <Text
                  style={[
                    styles.status,
                    item.status === "accepted" && styles.ok,
                    item.status === "rejected" && styles.bad,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <Text style={styles.meta}>
                {item.guest_email} · {new Date(item.submitted_at).toLocaleDateString()}
              </Text>
            </Pressable>

            {d ? (
              <View style={styles.detail}>
                {Object.entries(d.data || {})
                  .filter(([k]) => !k.startsWith("__"))
                  .map(([k, v]) => (
                    <View key={k} style={styles.dRow}>
                      <Text style={styles.dKey}>{k.replace(/_/g, " ")}</Text>
                      <Text style={styles.dVal}>{String(v)}</Text>
                    </View>
                  ))}
                {item.review_note ? <Text style={styles.note}>Note: {item.review_note}</Text> : null}
              </View>
            ) : null}

            {pending ? (
              rejectingId === item.id ? (
                <View style={styles.rejectBox}>
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Reason for rejection"
                    placeholderTextColor={colors.muted}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                  />
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => {
                        setRejectingId(null);
                        setReason("");
                      }}
                    >
                      <Text style={styles.secondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={styles.dangerBtn}
                      onPress={() => confirmReject(item.id)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Confirm reject</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable style={styles.secondaryBtn} onPress={() => toggle(item.id)}>
                    <Text style={styles.secondaryText}>{d ? "Hide" : "View"}</Text>
                  </Pressable>
                  <Pressable style={styles.dangerOutline} onPress={() => setRejectingId(item.id)}>
                    <Text style={styles.dangerText}>Reject</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={() => accept(item.id)} disabled={busyId === item.id}>
                    {busyId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Accept</Text>
                    )}
                  </Pressable>
                </View>
              )
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 12, paddingBottom: 32 },
  card: {
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  status: { fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  ok: { color: colors.primary },
  bad: { color: colors.danger },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  dRow: { marginBottom: 6 },
  dKey: { fontSize: 12, color: colors.muted, textTransform: "capitalize" },
  dVal: { fontSize: 14, color: colors.text },
  note: { fontSize: 13, color: colors.muted, marginTop: 6, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  secondaryText: { color: colors.text, fontWeight: "600" },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "600" },
  dangerOutline: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
  },
  dangerText: { color: colors.danger, fontWeight: "600" },
  dangerBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  rejectBox: { marginTop: 12 },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 60,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
    textAlignVertical: "top",
  },
});
