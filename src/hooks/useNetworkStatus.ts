"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseNetworkStatusReturn {
  /** `true` when the browser reports an active network connection */
  isOnline: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNetworkStatus(): UseNetworkStatusReturn {
  // Default to `true` so SSR and first client render agree; the effect
  // below will correct it immediately if the browser is actually offline.
  const [isOnline, setIsOnline] = useState(true);

  const goOnline = useCallback(() => setIsOnline(true), []);
  const goOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    // Sync with the real value on mount (navigator.onLine is only
    // available in the browser).
    setIsOnline(navigator.onLine);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [goOnline, goOffline]);

  return { isOnline };
}
