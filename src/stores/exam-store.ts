import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExamQuestion {
  id: string;
  type: "choice" | "truefalse" | "essay";
  content: string;
  options?: { label: string; text: string; imageUrl?: string | null }[];
  multiSelect?: boolean;
}

export interface ExamState {
  sessionId: string | null;
  questions: ExamQuestion[];
  answers: Record<string, string>;
  flags: Set<string>;
  currentIndex: number;
  timeRemaining: number;
}

export interface ExamActions {
  setSession: (sessionId: string, questions: ExamQuestion[], timeRemaining: number) => void;
  setAnswer: (questionId: string, answer: string) => void;
  toggleFlag: (questionId: string) => void;
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  setTimeRemaining: (seconds: number) => void;
  reset: () => void;
}

export type ExamStore = ExamState & ExamActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: ExamState = {
  sessionId: null,
  questions: [],
  answers: {},
  flags: new Set<string>(),
  currentIndex: 0,
  timeRemaining: 0,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExamStore = create<ExamStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSession: (sessionId, questions, timeRemaining) =>
        set({
          sessionId,
          questions,
          timeRemaining,
          answers: {},
          flags: new Set<string>(),
          currentIndex: 0,
        }),

      setAnswer: (questionId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: answer },
        })),

      toggleFlag: (questionId) =>
        set((state) => {
          const next = new Set(state.flags);
          if (next.has(questionId)) {
            next.delete(questionId);
          } else {
            next.add(questionId);
          }
          return { flags: next };
        }),

      goToQuestion: (index) => {
        const { questions } = get();
        if (index >= 0 && index < questions.length) {
          set({ currentIndex: index });
        }
      },

      nextQuestion: () => {
        const { currentIndex, questions } = get();
        if (currentIndex < questions.length - 1) {
          set({ currentIndex: currentIndex + 1 });
        }
      },

      prevQuestion: () => {
        const { currentIndex } = get();
        if (currentIndex > 0) {
          set({ currentIndex: currentIndex - 1 });
        }
      },

      setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

      reset: () => set({ ...initialState, flags: new Set<string>() }),
    }),
    {
      name: "exam-session",
      storage: createJSONStorage(() => localStorage, {
        // Set<string> is not JSON-serialisable out of the box.
        // Convert to/from arrays during (de)serialisation.
        replacer: (_key, value) => {
          if (value instanceof Set) {
            return { __type: "Set", values: [...value] };
          }
          return value;
        },
        reviver: (_key, value) => {
          if (
            value !== null &&
            typeof value === "object" &&
            (value as Record<string, unknown>).__type === "Set" &&
            Array.isArray((value as Record<string, unknown>).values)
          ) {
            return new Set((value as { values: string[] }).values);
          }
          return value;
        },
      }),
      partialize: (state) => ({
        sessionId: state.sessionId,
        questions: state.questions,
        answers: state.answers,
        flags: state.flags,
        currentIndex: state.currentIndex,
        timeRemaining: state.timeRemaining,
      }),
    },
  ),
);
