import { useBackgroundSync } from "./useBackgroundSync";

/** Back-compat: `pending` = submits + uploads awaiting sync. */
export function useOfflineSync(token: string | null, onSynced?: () => void) {
  const sync = useBackgroundSync(token, onSynced);
  return { online: sync.online, pending: sync.pendingTotal };
}
