"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTimerReturn {
  /** Seconds remaining on the countdown */
  timeRemaining: number;
  /** Whether the timer is currently ticking */
  isRunning: boolean;
  /** Start (or resume) the countdown */
  start: () => void;
  /** Pause the countdown */
  pause: () => void;
  /** Reset the countdown to a new duration (does NOT auto-start) */
  reset: (seconds?: number) => void;
  /** Human-readable string, e.g. "05:30" or "01:05:30" */
  formattedTime: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimer(
  initialSeconds: number,
  onExpire?: () => void,
): UseTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  // Keep a stable reference to the callback so the interval closure
  // always calls the latest version without re-creating the interval.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- internal helpers ---------------------------------------------------

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ---- public API ---------------------------------------------------------

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(
    (seconds?: number) => {
      clearTimer();
      setIsRunning(false);
      setTimeRemaining(seconds ?? initialSeconds);
    },
    [clearTimer, initialSeconds],
  );

  // Track whether we've already fired the expiry callback
  const expiredRef = useRef(false);

  // ---- effect: manage interval based on isRunning -------------------------

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);

    return clearTimer;
  }, [isRunning, clearTimer]);

  // ---- effect: fire onExpire when time reaches 0 --------------------------

  useEffect(() => {
    if (timeRemaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current?.();
    }
  }, [timeRemaining]);

  // ---- cleanup on unmount -------------------------------------------------

  useEffect(() => clearTimer, [clearTimer]);

  return {
    timeRemaining,
    isRunning,
    start,
    pause,
    reset,
    formattedTime: formatTime(timeRemaining),
  };
}
