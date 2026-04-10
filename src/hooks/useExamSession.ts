"use client";

import { useCallback, useMemo } from "react";
import { useExamStore, type ExamQuestion } from "@/stores/exam-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseExamSessionReturn {
  /** The question object for the current index, or `null` if none */
  currentQuestion: ExamQuestion | null;
  /** Zero-based index of the currently displayed question */
  currentIndex: number;
  /** Total number of questions in this session */
  totalQuestions: number;
  /** All recorded answers keyed by question ID */
  answers: Record<string, string>;
  /** Set of flagged question IDs */
  flags: Set<string>;

  // Navigation
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;

  // Mutations
  setAnswer: (questionId: string, answer: string) => void;
  toggleFlag: (questionId: string) => void;

  // Derived counts
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExamSession(): UseExamSessionReturn {
  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const flags = useExamStore((s) => s.flags);
  const currentIndex = useExamStore((s) => s.currentIndex);

  const goToQuestion = useExamStore((s) => s.goToQuestion);
  const nextQuestion = useExamStore((s) => s.nextQuestion);
  const prevQuestion = useExamStore((s) => s.prevQuestion);
  const storeSetAnswer = useExamStore((s) => s.setAnswer);
  const storeToggleFlag = useExamStore((s) => s.toggleFlag);

  // ---- derived values -----------------------------------------------------

  const currentQuestion: ExamQuestion | null =
    questions[currentIndex] ?? null;

  const totalQuestions = questions.length;

  const answeredCount = useMemo(() => {
    return questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;
  }, [questions, answers]);

  const unansweredCount = totalQuestions - answeredCount;

  const flaggedCount = useMemo(() => flags.size, [flags]);

  // ---- stable callbacks ---------------------------------------------------

  const setAnswer = useCallback(
    (questionId: string, answer: string) => storeSetAnswer(questionId, answer),
    [storeSetAnswer],
  );

  const toggleFlag = useCallback(
    (questionId: string) => storeToggleFlag(questionId),
    [storeToggleFlag],
  );

  return {
    currentQuestion,
    currentIndex,
    totalQuestions,
    answers,
    flags,
    goToQuestion,
    nextQuestion,
    prevQuestion,
    setAnswer,
    toggleFlag,
    answeredCount,
    unansweredCount,
    flaggedCount,
  };
}
