import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { apiFetch } from "../api/client";
import { dequeueSubmit, loadQueue } from "../lib/offlineQueue";

export function useOfflineSync(token: string | null, onSynced?: () => void) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!token || !online) return;

    let cancelled = false;
    let running = false;

    async function drain() {
      if (running) return;
      running = true;
      try {
        const q = await loadQueue();
        if (cancelled) return;
        setPending(q.length);
        for (const item of q) {
          try {
            await apiFetch(
              `/api/v1/workflows/${item.workflowId}/submit`,
              {
                method: "POST",
                body: JSON.stringify({ data: item.data }),
              },
              token
            );
            await dequeueSubmit(item.id);
          } catch {
            break;
          }
        }
        const left = await loadQueue();
        if (cancelled) return;
        setPending(left.length);
        if (q.length > left.length) onSynced?.();
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

  return { online, pending };
}
