import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

const MAP: Record<string, { bg: string; fg: string; label: string }> = {
  in_progress: { bg: "#e0e7ff", fg: colors.primary, label: "In progress" },
  approved: { bg: "#d1fae5", fg: colors.success, label: "Approved" },
  rejected: { bg: "#fee2e2", fg: colors.danger, label: "Rejected" },
  returned: { bg: "#ffedd5", fg: colors.warning, label: "Returned" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { bg: colors.border, fg: colors.muted, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 12, fontWeight: "600" },
});
