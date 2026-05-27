import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export function NetworkStatusBanner() {
  const { refreshUser } = useAuth();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      void refreshUser();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [refreshUser]);

  if (!offline) return null;

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 text-center"
      role="status"
      data-testid="network-offline-banner"
    >
      You are offline. Changes may not save until your connection is restored.
    </div>
  );
}
