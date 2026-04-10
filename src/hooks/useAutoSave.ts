"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useExamStore } from "@/stores/exam-store";
import { useNetworkStatus } from "./useNetworkStatus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedAnswer {
  questionId: string;
  content: string;
}

export interface UseAutoSaveReturn {
  /** Persist a single answer through all three tiers */
  saveAnswer: (questionId: string, content: string) => void;
  /** Whether a server-side save is currently in flight */
  isSaving: boolean;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Number of answers queued for sync (offline queue) */
  pendingCount: number;
  /** Timestamp of the last successful server save (`null` if none yet) */
  lastSavedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 800;
const API_ENDPOINT = "/api/exam/answer";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAutoSave(sessionId: string): UseAutoSaveReturn {
  const { isOnline } = useNetworkStatus();
  const setAnswer = useExamStore((s) => s.setAnswer);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Offline queue – ref so mutations don't trigger re-renders.
  const queueRef = useRef<QueuedAnswer[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Abort controller for in-flight requests on unmount.
  const abortRef = useRef<AbortController | null>(null);

  // ------------------------------------------------------------------
  // Tier 2 – debounced POST to API
  // ------------------------------------------------------------------

  const postAnswer = useCallback(
    async (questionId: string, content: string) => {
      // Cancel any previous in-flight request so we don't pile up.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSaving(true);
      try {
        const res = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, questionId, answerContent: content }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }

        setLastSavedAt(new Date());
      } catch (err: unknown) {
        // If the request was intentionally aborted, ignore it.
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Network error or non-OK status – push to offline queue.
        queueRef.current.push({ questionId, content });
        setPendingCount(queueRef.current.length);
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId],
  );

  const debouncedPost = useDebouncedCallback(
    (questionId: string, content: string) => {
      if (isOnline) {
        postAnswer(questionId, content);
      } else {
        // Offline – queue immediately without waiting.
        queueRef.current.push({ questionId, content });
        setPendingCount(queueRef.current.length);
      }
    },
    DEBOUNCE_MS,
  );

  // ------------------------------------------------------------------
  // Tier 3 – flush offline queue when connectivity is restored
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!isOnline || queueRef.current.length === 0) return;

    const flush = async () => {
      // Drain the queue. We take a snapshot so new items queued during
      // flushing end up in a subsequent flush cycle.
      const batch = [...queueRef.current];
      queueRef.current = [];
      setPendingCount(0);

      setIsSaving(true);

      for (const item of batch) {
        try {
          const res = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              questionId: item.questionId,
              answerContent: item.content,
            }),
          });

          if (!res.ok) throw new Error(`Server responded with ${res.status}`);
          setLastSavedAt(new Date());
        } catch {
          // Re-queue failed items so they can be retried later.
          queueRef.current.push(item);
        }
      }

      setPendingCount(queueRef.current.length);
      setIsSaving(false);
    };

    flush();
  }, [isOnline, sessionId]);

  // ------------------------------------------------------------------
  // Cleanup in-flight requests on unmount
  // ------------------------------------------------------------------

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ------------------------------------------------------------------
  // Public API – the single `saveAnswer` function
  // ------------------------------------------------------------------

  const saveAnswer = useCallback(
    (questionId: string, content: string) => {
      // Tier 1 – Zustand store (persisted to localStorage by middleware)
      setAnswer(questionId, content);

      // Tier 2 – debounced server save (or queue if offline)
      debouncedPost(questionId, content);
    },
    [setAnswer, debouncedPost],
  );

  return {
    saveAnswer,
    isSaving,
    isOnline,
    pendingCount,
    lastSavedAt,
  };
}
