import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionFilters {
  type: string;
  department: string;
  level: string;
  search: string;
}

export interface AdminState {
  questionFilters: QuestionFilters;
  examFilter: string;
  selectedIds: Set<string>;
}

export interface AdminActions {
  setQuestionFilter: <K extends keyof QuestionFilters>(
    key: K,
    value: QuestionFilters[K],
  ) => void;
  resetFilters: () => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
}

export type AdminStore = AdminState & AdminActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultFilters: QuestionFilters = {
  type: "",
  department: "",
  level: "",
  search: "",
};

const initialState: AdminState = {
  questionFilters: { ...defaultFilters },
  examFilter: "",
  selectedIds: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAdminStore = create<AdminStore>()((set) => ({
  ...initialState,

  setQuestionFilter: (key, value) =>
    set((state) => ({
      questionFilters: { ...state.questionFilters, [key]: value },
    })),

  resetFilters: () =>
    set({
      questionFilters: { ...defaultFilters },
      examFilter: "",
    }),

  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set<string>() }),
}));
