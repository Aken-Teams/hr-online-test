"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTabDetectionReturn {
  /** Total number of times the user switched away from this tab */
  switchCount: number;
  /** Whether the tab is currently visible / in the foreground */
  isVisible: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Detects when the user switches away from the browser tab.
 *
 * @param onSwitch - called each time the user leaves the tab,
 *                   receives the updated cumulative switch count
 */
export function useTabDetection(
  onSwitch?: (count: number) => void,
): UseTabDetectionReturn {
  const [switchCount, setSwitchCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Stable ref so the listener always invokes the latest callback.
  const onSwitchRef = useRef(onSwitch);
  onSwitchRef.current = onSwitch;

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // User navigated away
      setIsVisible(false);
      setSwitchCount((prev) => {
        const next = prev + 1;
        onSwitchRef.current?.(next);
        return next;
      });
    } else {
      // User returned
      setIsVisible(true);
    }
  }, []);

  useEffect(() => {
    // Initialise based on current visibility state (tab may already be
    // hidden if e.g. the component mounts while the user is on a
    // different tab).
    setIsVisible(!document.hidden);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  return { switchCount, isVisible };
}
