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
      setSwitchCount((prev) => prev + 1);
    } else {
      // User returned
      setIsVisible(true);
    }
  }, []);

  // Fire the callback in a separate effect to avoid setState-during-setState
  // (the callback typically calls toast() which updates ToastProvider state).
  useEffect(() => {
    if (switchCount > 0) {
      onSwitchRef.current?.(switchCount);
    }
  }, [switchCount]);

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
