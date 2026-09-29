import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, apiUpload, type ChecklistTask, type Obligation } from "../../src/api/client";
import { EmptyState } from "../../src/components/EmptyState";
import { colors } from "../../src/theme/colors";

type Segment = "checklists" | "obligations";
const DONE_STATES = ["done", "completed", "approved", "skipped"];

export default function TasksScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("checklists");
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [t, o] = await Promise.all([
      apiFetch<ChecklistTask[]>("/api/v1/checklists/my", {}, token).catch(() => []),
      apiFetch<Obligation[]>("/api/v1/recurring-schedules/mine/obligations", {}, token).catch(() => []),
    ]);
    setTasks(t);
    setObligations(o);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  async function completeTask(item: ChecklistTask) {
    if (!token) return;
    if (item.attachment_required && !item.attachments?.length) {
      Alert.alert("Attachment required", "Attach a photo or file before completing this task.");
      return;
    }
    setBusyId(item.id);
    try {
      await apiFetch(`/api/v1/checklists/tasks/${item.id}/complete`, { method: "POST", body: JSON.stringify({}) }, token);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not complete task");
    } finally {
      setBusyId(null);
    }
  }

  async function attachPhoto(id: string) {
    if (!token) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusyId(id);
    try {
      await apiUpload(
        `/api/v1/checklists/tasks/${id}/attachments`,
        asset.uri,
        asset.fileName || "photo.jpg",
        asset.mimeType || "image/jpeg",
        token
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyId(null);
    }
  }

  async function acknowledge(id: string) {
    if (!token) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/recurring-schedules/obligations/${id}/acknowledge`, { method: "POST" }, token);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not acknowledge");
    } finally {
      setBusyId(null);
    }
  }

  const refresh = (
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
  );

  const openTasks = tasks.filter((t) => !DONE_STATES.includes(t.status)).length;
  const openObl = obligations.filter((o) => o.status !== "submitted").length;

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, segment === "checklists" && styles.tabActive]}
          onPress={() => setSegment("checklists")}
        >
          <Text style={[styles.tabText, segment === "checklists" && styles.tabTextActive]}>
            Checklists{openTasks ? ` (${openTasks})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, segment === "obligations" && styles.tabActive]}
          onPress={() => setSegment("obligations")}
        >
          <Text style={[styles.tabText, segment === "obligations" && styles.tabTextActive]}>
            Obligations{openObl ? ` (${openObl})` : ""}
          </Text>
        </Pressable>
      </View>

      {segment === "checklists" ? (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          refreshControl={refresh}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<EmptyState title="No tasks" message="Checklist tasks assigned to you show up here." />}
          renderItem={({ item }) => {
            const done = DONE_STATES.includes(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={[styles.status, done && styles.statusDone]}>{item.status}</Text>
                </View>
                <Text style={styles.meta}>
                  {item.checklist_name}
                  {item.due_date ? ` · due ${new Date(item.due_date).toLocaleDateString()}` : ""}
                </Text>
                {item.attachments?.length ? (
                  <Text style={styles.meta}>{item.attachments.length} attachment(s)</Text>
                ) : null}
                {!done ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => attachPhoto(item.id)}
                      disabled={busyId === item.id}
                    >
                      <Text style={styles.secondaryText}>Attach photo</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={() => completeTask(item)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Mark done</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={obligations}
          keyExtractor={(o) => o.id}
          refreshControl={refresh}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={
            <EmptyState title="Nothing due" message="Scheduled obligations assigned to you show up here." />
          }
          renderItem={({ item }) => {
            const done = item.status === "submitted";
            return (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.schedule_name}</Text>
                  <Text style={[styles.status, done && styles.statusDone]}>{item.status}</Text>
                </View>
                <Text style={styles.meta}>
                  {item.period_label}
                  {item.due_date ? ` · due ${new Date(item.due_date).toLocaleDateString()}` : ""}
                </Text>
                {!done ? (
                  <View style={styles.actions}>
                    {item.completion_mode === "submit_workflow" && item.workflow_definition_id ? (
                      <Pressable
                        style={styles.primaryBtn}
                        onPress={() => router.push(`/submit?wf=${item.workflow_definition_id}`)}
                      >
                        <Text style={styles.primaryText}>Submit now</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.primaryBtn}
                        onPress={() => acknowledge(item.id)}
                        disabled={busyId === item.id}
                      >
                        {busyId === item.id ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryText}>Mark done</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  listPad: { paddingHorizontal: 12, paddingBottom: 32 },
  card: {
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
  status: { fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  statusDone: { color: colors.primary },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  secondaryText: { color: colors.primary, fontWeight: "600" },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "600" },
});
