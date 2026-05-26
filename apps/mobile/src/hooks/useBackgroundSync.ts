import { useCallback, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { apiFetch, apiUpload } from "../api/client";
import { dequeueSubmit, loadQueue } from "../lib/offlineQueue";
import { dequeueUpload, loadUploadQueue } from "../lib/uploadQueue";

export function useBackgroundSync(token: string | null, onSynced?: () => void) {
  const [online, setOnline] = useState(true);
  const [pendingSubmits, setPendingSubmits] = useState(0);
  const [pendingUploads, setPendingUploads] = useState(0);

  const refreshCounts = useCallback(async () => {
    const [subs, ups] = await Promise.all([loadQueue(), loadUploadQueue()]);
    setPendingSubmits(subs.length);
    setPendingUploads(ups.length);
  }, []);

  useEffect(() => {
    void refreshCounts();
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
    return () => unsub();
  }, [refreshCounts]);

  useEffect(() => {
    if (!token || !online) return;

    let cancelled = false;
    let running = false;

    async function drain() {
      if (running) return;
      running = true;
      try {
        const submitQ = await loadQueue();
        const uploadQ = await loadUploadQueue();
        if (cancelled) return;
        setPendingSubmits(submitQ.length);
        setPendingUploads(uploadQ.length);

        let synced = false;

        for (const item of submitQ) {
          try {
            await apiFetch(
              `/api/v1/workflows/${item.workflowId}/submit`,
              { method: "POST", body: JSON.stringify({ data: item.data }) },
              token
            );
            await dequeueSubmit(item.id);
            synced = true;
          } catch {
            break;
          }
        }

        for (const item of uploadQ) {
          try {
            await apiUpload(item.path, item.uri, item.filename, item.mime, token);
            await dequeueUpload(item.id);
            synced = true;
          } catch {
            break;
          }
        }

        const leftSubs = await loadQueue();
        const leftUps = await loadUploadQueue();
        if (cancelled) return;
        setPendingSubmits(leftSubs.length);
        setPendingUploads(leftUps.length);
        if (synced) onSynced?.();
      } finally {
        running = false;
      }
    }

    void drain();
    const t = setInterval(() => void drain(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token, online, onSynced]);

  return {
    online,
    pendingSubmits,
    pendingUploads,
    pendingTotal: pendingSubmits + pendingUploads,
    refreshCounts,
  };
}
