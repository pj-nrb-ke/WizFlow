import * as Notifications from "expo-notifications";
import type { Router } from "expo-router";

let navigationReady = false;

export function setupPushNavigation(router: Router): void {
  if (navigationReady) return;
  navigationReady = true;

  Notifications.addNotificationResponseReceivedListener((resp) => {
    const action = resp.actionIdentifier;
    if (action === "approve" || action === "reject") return;

    const data = (resp.notification.request.content.data || {}) as { instance_id?: string };
    const id = data.instance_id;
    if (id) router.push(`/approval/${id}`);
  });
}
