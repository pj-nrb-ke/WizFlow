import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/theme/colors";

export default function LoginScreen() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("admin@demo.wizflow.biz");
  const [password, setPassword] = useState("changeme");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  async function onLogin() {
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.logo}>WizFlow</Text>
        <Text style={styles.tagline}>Approvals on the go</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={onLogin} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.primary,
    paddingTop: 80,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  logo: { fontSize: 36, fontWeight: "700", color: "#fff" },
  tagline: { fontSize: 16, color: "#c7d2fe", marginTop: 8 },
  card: {
    margin: 20,
    marginTop: -24,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, marginBottom: 12, fontSize: 14 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
