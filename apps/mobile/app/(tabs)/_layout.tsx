import { useEffect } from "react";
import { Redirect, Tabs, useRouter } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { useBackgroundSync } from "../../src/hooks/useBackgroundSync";
import { setupPushNavigation } from "../../src/notifications/handlers";
import { colors } from "../../src/theme/colors";

function TabIcon({ label }: { label: string }) {
  return <Text style={{ fontSize: 18 }}>{label}</Text>;
}

export default function TabsLayout() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { pendingTotal } = useBackgroundSync(token);

  useEffect(() => {
    setupPushNavigation(router);
  }, [router]);

  if (!user) return <Redirect href="/login" />;

  const syncBadge = pendingTotal > 0 ? pendingTotal : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: () => <TabIcon label="⌂" /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: () => <TabIcon label="✉" /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: "My requests", tabBarIcon: () => <TabIcon label="☰" /> }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: "Submit",
          tabBarIcon: () => <TabIcon label="＋" />,
          tabBarBadge: syncBadge,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Alerts", tabBarIcon: () => <TabIcon label="◉" /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: () => <TabIcon label="⚙" /> }}
      />
    </Tabs>
  );
}
