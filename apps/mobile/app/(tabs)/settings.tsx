import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { apiFetch, type NotificationPreferences } from "../../src/api/client";
import {
  canUseBiometric,
  isBiometricEnabled,
  setBiometricEnabled,
} from "../../src/lib/biometrics";
import { colors } from "../../src/theme/colors";
import { canAccessAnalytics } from "../../src/lib/roles";
import { registerPushToken } from "../../src/notifications/push";

export default function SettingsScreen() {
  const { user, token, logout } = useAuth();
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [push, setPush] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const showManager = canAccessAnalytics(user?.roles);

  useEffect(() => {
    canUseBiometric().then(setBioAvailable);
    isBiometricEnabled().then((v) => setBiometric(v));
    if (!token) return;
    apiFetch<{ notification_preferences?: NotificationPreferences }>("/api/v1/auth/me", {}, token)
      .then((me) => {
        const p = me.notification_preferences;
        if (p) {
          setEmail(p.email);
          setInApp(p.in_app);
          setPush(p.push !== false);
          setWhatsapp(!!p.whatsapp);
        }
      })
      .catch(() => {});
  }, [token]);

  async function savePrefs(patch: Partial<NotificationPreferences>) {
    if (!token) return;
    await apiFetch("/api/v1/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }, token);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.full_name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.company}>{user?.company_name}</Text>
      </View>

      {showManager ? (
        <>
          <Text style={styles.section}>Manager tools</Text>
          <Link href="/templates" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkLabel}>Browse templates</Text>
              <Text style={styles.linkRight}>›</Text>
            </Pressable>
          </Link>
          <Link href="/workflows" asChild>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkLabel}>Workflows (read-only)</Text>
              <Text style={styles.linkRight}>›</Text>
            </Pressable>
          </Link>
        </>
      ) : null}

      <Text style={styles.section}>Notifications</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Email alerts</Text>
        <Switch
          value={email}
          onValueChange={(v) => {
            setEmail(v);
            void savePrefs({ email: v });
          }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>In-app alerts</Text>
        <Switch
          value={inApp}
          onValueChange={(v) => {
            setInApp(v);
            void savePrefs({ in_app: v });
          }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Push notifications</Text>
        <Switch
          value={push}
          onValueChange={(v) => {
            setPush(v);
            void savePrefs({ push: v });
            if (v && token) void registerPushToken(token);
          }}
        />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.rowLabel}>WhatsApp alerts</Text>
          <Text style={styles.rowHint}>Preference saved; channel activates when enabled for your company.</Text>
        </View>
        <Switch
          value={whatsapp}
          onValueChange={(v) => {
            setWhatsapp(v);
            void savePrefs({ whatsapp: v });
          }}
        />
      </View>

      {bioAvailable ? (
        <>
          <Text style={styles.section}>Security</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Biometric unlock</Text>
            <Switch
              value={biometric}
              onValueChange={async (v) => {
                await setBiometricEnabled(v);
                setBiometric(v);
              }}
            />
          </View>
        </>
      ) : null}

      <Pressable
        style={styles.signOut}
        onPress={() => {
          Alert.alert("Sign out", "Leave WizFlow?", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => logout() },
          ]);
        }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  email: { fontSize: 14, color: colors.muted, marginTop: 4 },
  company: { fontSize: 14, color: colors.primary, marginTop: 8 },
  section: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkLabel: { fontSize: 15, color: colors.text, fontWeight: "600" },
  linkRight: { fontSize: 18, color: colors.muted, fontWeight: "700" },
  rowLabel: { fontSize: 15, color: colors.text },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 },
  signOut: { marginTop: 32, alignItems: "center", padding: 14 },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
});
