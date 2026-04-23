/**
 * Exam batch (梯次) time window utilities.
 *
 * When an exam has batches, the employee can only start during one of the
 * batch windows. When there are no batches, the exam's own openAt/closeAt
 * is used (backward compatible).
 */

interface BatchLike {
  id: string;
  name: string;
  openAt: Date;
  closeAt: Date;
}

interface ExamTimeLike {
  openAt: Date | null;
  closeAt: Date | null;
}

export interface TimeWindowResult {
  /** Whether the current time is within an allowed window */
  inWindow: boolean;
  /** The batch the employee is currently in (if any) */
  currentBatch?: { id: string; name: string };
  /** The next upcoming batch (if not in any window and batches remain) */
  nextBatch?: { id: string; name: string; openAt: Date };
  /** Whether all batch windows have passed */
  allBatchesEnded?: boolean;
}

/**
 * Check if the current time falls within an exam's time window.
 * Batch-aware: if the exam has batches, checks batch windows instead.
 */
export function isInExamTimeWindow(
  exam: ExamTimeLike,
  batches: BatchLike[],
  now: Date = new Date()
): TimeWindowResult {
  // No batches → use exam-level openAt/closeAt (existing logic)
  if (batches.length === 0) {
    const isBeforeOpen = exam.openAt ? exam.openAt > now : false;
    const isAfterClose = exam.closeAt ? exam.closeAt < now : false;
    return { inWindow: !isBeforeOpen && !isAfterClose };
  }

  // Sort batches by openAt
  const sorted = [...batches].sort(
    (a, b) => a.openAt.getTime() - b.openAt.getTime()
  );

  // Check if currently inside any batch window
  for (const batch of sorted) {
    if (now >= batch.openAt && now <= batch.closeAt) {
      return {
        inWindow: true,
        currentBatch: { id: batch.id, name: batch.name },
      };
    }
  }

  // Not in any window — find next upcoming batch
  for (const batch of sorted) {
    if (batch.openAt > now) {
      return {
        inWindow: false,
        nextBatch: { id: batch.id, name: batch.name, openAt: batch.openAt },
      };
    }
  }

  // All batches have ended
  return { inWindow: false, allBatchesEnded: true };
}
