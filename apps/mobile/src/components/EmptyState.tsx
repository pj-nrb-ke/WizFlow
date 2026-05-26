import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 32, alignItems: "center" },
  title: { fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "center" },
  msg: { fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center" },
});
