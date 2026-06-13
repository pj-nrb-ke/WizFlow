import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { ApiError, apiFetch, type NotificationPreferences } from "../../src/api/client";
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

  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [twoFaSecret, setTwoFaSecret] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  useEffect(() => {
    canUseBiometric().then(setBioAvailable);
    isBiometricEnabled().then((v) => setBiometric(v));
    if (!token) return;
    apiFetch<{ enabled: boolean }>("/api/v1/auth/2fa/status", {}, token)
      .then((s) => setTwoFaEnabled(s.enabled))
      .catch(() => {});
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

  async function startTwoFaSetup() {
    if (!token) return;
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      const res = await apiFetch<{ secret: string; otpauth_uri: string }>(
        "/api/v1/auth/2fa/setup",
        { method: "POST" },
        token
      );
      setTwoFaSecret(res.secret);
      setTwoFaCode("");
    } catch (e) {
      setTwoFaError(e instanceof ApiError ? e.message : "Could not start setup");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function enableTwoFa() {
    if (!token) return;
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      await apiFetch(
        "/api/v1/auth/2fa/enable",
        { method: "POST", body: JSON.stringify({ code: twoFaCode.trim() }) },
        token
      );
      setTwoFaEnabled(true);
      setTwoFaSecret(null);
      setTwoFaCode("");
    } catch (e) {
      setTwoFaError(e instanceof ApiError ? e.message : "Could not enable");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function disableTwoFa() {
    if (!token) return;
    setTwoFaError("");
    setTwoFaBusy(true);
    try {
      await apiFetch(
        "/api/v1/auth/2fa/disable",
        { method: "POST", body: JSON.stringify({ code: twoFaCode.trim() }) },
        token
      );
      setTwoFaEnabled(false);
      setTwoFaCode("");
    } catch (e) {
      setTwoFaError(e instanceof ApiError ? e.message : "Could not turn off");
    } finally {
      setTwoFaBusy(false);
    }
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

      <Text style={styles.section}>Two-factor authentication</Text>
      {twoFaEnabled === null ? (
        <View style={styles.twoFaCard}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : twoFaEnabled ? (
        <View style={styles.twoFaCard}>
          <Text style={styles.twoFaTitle}>Two-factor is on</Text>
          <Text style={styles.twoFaHint}>
            Enter a current code from your authenticator app to turn it off.
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
            value={twoFaCode}
            onChangeText={setTwoFaCode}
            placeholder="6-digit code"
          />
          {twoFaError ? <Text style={styles.twoFaError}>{twoFaError}</Text> : null}
          <Pressable
            style={[styles.twoFaBtn, styles.twoFaBtnDanger]}
            onPress={disableTwoFa}
            disabled={twoFaBusy}
          >
            {twoFaBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.twoFaBtnText}>Turn off</Text>
            )}
          </Pressable>
        </View>
      ) : twoFaSecret ? (
        <View style={styles.twoFaCard}>
          <Text style={styles.twoFaHint}>
            In Google Authenticator, tap + then &quot;Enter a setup key&quot;. Use your email
            ({user?.email}) as the account, paste the key below, and keep the type set to
            time-based.
          </Text>
          <Text style={styles.secret} selectable={true}>
            {twoFaSecret}
          </Text>
          <Text style={styles.twoFaHint}>
            Then enter the 6-digit code it generates to finish.
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
            value={twoFaCode}
            onChangeText={setTwoFaCode}
            placeholder="6-digit code"
          />
          {twoFaError ? <Text style={styles.twoFaError}>{twoFaError}</Text> : null}
          <Pressable style={styles.twoFaBtn} onPress={enableTwoFa} disabled={twoFaBusy}>
            {twoFaBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.twoFaBtnText}>Verify &amp; enable</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.twoFaCard}>
          <Text style={styles.twoFaHint}>
            Add an extra layer of security with Google Authenticator.
          </Text>
          {twoFaError ? <Text style={styles.twoFaError}>{twoFaError}</Text> : null}
          <Pressable style={styles.twoFaBtn} onPress={startTwoFaSetup} disabled={twoFaBusy}>
            {twoFaBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.twoFaBtnText}>Set up</Text>
            )}
          </Pressable>
        </View>
      )}

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
  twoFaCard: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  twoFaTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 6 },
  twoFaHint: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 12 },
  secret: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  twoFaError: { color: colors.danger, fontSize: 13, marginBottom: 12 },
  twoFaBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  twoFaBtnDanger: { backgroundColor: colors.danger },
  twoFaBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  signOut: { marginTop: 32, alignItems: "center", padding: 14 },
  signOutText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
});
