import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { FormField } from "../lib/formUtils";
import { colors } from "../theme/colors";

type Props = {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  highlightKeys?: Set<string>;
};

export function FormRenderer({ fields, values, onChange, highlightKeys }: Props) {
  return (
    <View style={styles.wrap}>
      {fields.map((f) => {
        if (f.type === "label") {
          return (
            <Text key={f.key} style={styles.labelOnly}>
              {f.content || f.label}
            </Text>
          );
        }
        const highlighted = highlightKeys?.has(f.key);
        const hasOptions = !!(f.options && f.options.length > 0);
        return (
          <View key={f.key} style={[styles.field, highlighted && styles.highlight]}>
            <Text style={styles.label}>
              {f.label}
              {f.required ? " *" : ""}
            </Text>
            {hasOptions ? (
              <View style={styles.chips}>
                {(f.options ?? []).map((o) => {
                  const selected = (values[f.key] ?? "") === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => onChange(f.key, o.value)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={values[f.key] ?? ""}
                onChangeText={(t) => onChange(f.key, t)}
                placeholder={f.placeholder || f.label}
                keyboardType={f.type === "number" ? "decimal-pad" : "default"}
                multiline={f.type === "text" && (f.key.includes("purpose") || f.key.includes("comment"))}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  field: {},
  highlight: {
    borderWidth: 2,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 8,
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 },
  labelOnly: { fontSize: 15, fontWeight: "600", color: colors.text, marginVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.card,
    color: colors.text,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: "#fff" },
});
