import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/AuthContext";
import { colors } from "../src/theme/colors";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="approval/[id]" options={{ title: "Approval" }} />
        <Stack.Screen name="request/[id]" options={{ title: "My request" }} />
        <Stack.Screen name="public-approve/[token]" options={{ title: "Email approval" }} />
        <Stack.Screen name="templates" options={{ title: "Templates" }} />
        <Stack.Screen name="workflows" options={{ title: "Workflows" }} />
      </Stack>
    </AuthProvider>
  );
}
