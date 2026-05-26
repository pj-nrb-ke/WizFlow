import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { apiFetch } from "../api/client";
import { getAccessToken } from "../auth/storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let actionsInit = false;

async function ensureActionCategory(): Promise<void> {
  if (actionsInit) return;
  actionsInit = true;
  try {
    await Notifications.setNotificationCategoryAsync("approval_actions", [
      { identifier: "approve", buttonTitle: "Approve", options: { opensAppToForeground: false } },
      { identifier: "reject", buttonTitle: "Reject", options: { opensAppToForeground: false } },
    ]);

    Notifications.addNotificationResponseReceivedListener(async (resp) => {
      const action = resp.actionIdentifier;
      if (action !== "approve" && action !== "reject") return;

      const data = (resp.notification.request.content.data || {}) as { instance_id?: string };
      const id = data.instance_id;
      if (!id) return;

      const token = await getAccessToken();
      if (!token) return;
      try {
        await apiFetch(
          `/api/v1/requests/${id}/${action}`,
          { method: "POST", body: JSON.stringify({ comment: null }) },
          token
        );
      } catch {
        /* best-effort */
      }
    });
  } catch {
    /* optional */
  }
}

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const id = extra?.eas?.projectId;
  if (!id || id.includes("placeholder")) return undefined;
  return id;
}

export async function registerPushToken(accessToken: string): Promise<void> {
  try {
    await ensureActionCategory();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return;

    const projectId = expoProjectId();
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
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
