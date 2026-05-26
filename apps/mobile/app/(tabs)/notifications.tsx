import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type NotificationItem } from "../../src/api/client";
import { colors } from "../../src/theme/colors";

export default function NotificationsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<NotificationItem[]>("/api/v1/notifications", {}, token);
    setItems(data);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  async function openItem(n: NotificationItem) {
    if (!token) return;
    if (!n.read) {
      await apiFetch(`/api/v1/notifications/${n.id}/read`, { method: "POST" }, token);
      void Haptics.selectionAsync();
    }
    if (n.instance_id) {
      router.push(`/approval/${n.instance_id}`);
    }
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={(n) => n.id}
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
      ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.card, !item.read && styles.unread]}
          onPress={() => openItem(item)}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  body: { fontSize: 14, color: colors.muted, marginTop: 4 },
  time: { fontSize: 12, color: colors.muted, marginTop: 8 },
  empty: { textAlign: "center", marginTop: 40, color: colors.muted },
});
