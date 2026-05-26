import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiFetch } from "../api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(accessToken: string): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await apiFetch(
      "/api/v1/users/push-token",
      {
        method: "POST",
        body: JSON.stringify({
          token,
          platform: Platform.OS,
        }),
      },
      accessToken
    );
  } catch {
    /* Push optional until EAS project configured */
  }
}
