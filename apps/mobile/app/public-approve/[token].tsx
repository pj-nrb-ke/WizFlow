import { useEffect, useState } from "react";
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
import { useLocalSearchParams } from "expo-router";
import { apiFetch, type PublicApprovalView } from "../../src/api/client";
import { colors } from "../../src/theme/colors";

export default function PublicApproveScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [view, setView] = useState<PublicApprovalView | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<PublicApprovalView>(`/api/v1/public/approval/${token}`, {})
      .then(setView)
      .catch((e) => setError(e instanceof Error ? e.message : "Invalid link"))
      .finally(() => setLoading(false));
  }, [token]);

  async function decide(action: "approve" | "reject") {
    if (!token) return;
    try {
      await apiFetch(`/api/v1/public/approval/${token}/decide`, {
        method: "POST",
        body: JSON.stringify({ action, comment: comment.trim() || null }),
      });
      Alert.alert("Done", `Request ${action}d.`);
      setView(null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !view) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || "Link unavailable"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      <Text style={styles.title}>Email approval</Text>
      <Text style={styles.ref}>{view.reference_number}</Text>
      <Text style={styles.wf}>{view.workflow_name}</Text>
      <Text style={styles.meta}>
        {view.step_name} · {view.originator_name}
      </Text>
      <View style={styles.card}>
        {Object.entries(view.request_preview || {}).map(([k, v]) => (
          <Text key={k} style={styles.line}>
            {k}: {String(v)}
          </Text>
        ))}
      </View>
      <TextInput
        style={styles.comment}
        placeholder="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        multiline
      />
      <Pressable style={[styles.btn, styles.approve]} onPress={() => decide("approve")}>
        <Text style={styles.btnText}>Approve</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.reject]} onPress={() => decide("reject")}>
        <Text style={styles.btnText}>Reject</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 20 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 14, color: colors.muted, marginBottom: 8 },
  ref: { fontSize: 13, fontWeight: "700", color: colors.primary },
  wf: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  meta: { fontSize: 14, color: colors.muted, marginVertical: 12 },
  card: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  line: { fontSize: 14, marginBottom: 4, color: colors.text },
  comment: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 72,
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  btn: { borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 10 },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.danger },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: colors.danger, textAlign: "center" },
});
