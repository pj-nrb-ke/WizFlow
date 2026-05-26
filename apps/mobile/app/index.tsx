import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/theme/colors";

function routeFromUrl(url: string | null): string | null {
  if (!url) return null;
  const parsed = Linking.parse(url);
  const path = parsed.path?.replace(/^\//, "") ?? "";
  if (path.startsWith("public-approve/")) {
    const token = path.split("/")[1];
    return token ? `/public-approve/${token}` : null;
  }
  if (path.startsWith("approval/")) {
    const id = path.split("/")[1];
    return id ? `/approval/${id}` : null;
  }
  return null;
}

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const route = routeFromUrl(url);
      if (route) router.replace(route);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      const route = routeFromUrl(url);
      if (route) router.push(route);
    });
    return () => sub.remove();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
