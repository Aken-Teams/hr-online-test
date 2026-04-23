import { prisma } from '@/lib/prisma';

interface TransitionResult {
  activated: string[];
  closed: string[];
  errors: string[];
}

/**
 * Check all exams and auto-transition statuses based on openAt/closeAt times.
 *
 * - PUBLISHED → ACTIVE  when openAt <= now (must have rules & assignments, no other active exam)
 * - ACTIVE    → CLOSED  when closeAt <= now
 *
 * Returns a summary of transitions made.
 */
export async function syncExamStatuses(): Promise<TransitionResult> {
  const now = new Date();
  const result: TransitionResult = { activated: [], closed: [], errors: [] };

  try {
    // 1. Auto-close: ACTIVE exams past closeAt
    const examsToClose = await prisma.exam.findMany({
      where: {
        status: 'ACTIVE',
        closeAt: { not: null, lte: now },
      },
      select: { id: true, title: true },
    });

    for (const exam of examsToClose) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.exam.update({
            where: { id: exam.id },
            data: { status: 'CLOSED' },
          });
          await tx.auditLog.create({
            data: {
              adminId: 'SYSTEM',
              action: 'EXAM_CLOSED',
              details: {
                examId: exam.id,
                title: exam.title,
                previousStatus: 'ACTIVE',
                newStatus: 'CLOSED',
                trigger: 'auto_closeAt',
              },
            },
          });
        });
        result.closed.push(exam.id);
      } catch (err) {
        result.errors.push(`Failed to close exam ${exam.id}: ${err}`);
      }
    }

    // 2. Auto-activate: PUBLISHED exams past openAt
    const examsToActivate = await prisma.exam.findMany({
      where: {
        status: 'PUBLISHED',
        openAt: { not: null, lte: now },
      },
      include: {
        questionRules: { select: { id: true }, take: 1 },
        assignments: { select: { id: true }, take: 1 },
      },
      orderBy: { openAt: 'asc' },
    });

    for (const exam of examsToActivate) {
      // Must have at least one question rule and one assignment
      if (exam.questionRules.length === 0 || exam.assignments.length === 0) {
        continue;
      }

      // Check if another exam is already ACTIVE (respect single-active constraint)
      const activeExam = await prisma.exam.findFirst({
        where: { status: 'ACTIVE', id: { not: exam.id } },
        select: { id: true },
      });
      if (activeExam) {
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.exam.update({
            where: { id: exam.id },
            data: { status: 'ACTIVE' },
          });
          await tx.auditLog.create({
            data: {
              adminId: 'SYSTEM',
              action: 'EXAM_PUBLISHED',
              details: {
                examId: exam.id,
                title: exam.title,
                previousStatus: 'PUBLISHED',
                newStatus: 'ACTIVE',
                trigger: 'auto_openAt',
              },
            },
          });
        });
        result.activated.push(exam.id);
      } catch (err) {
        result.errors.push(`Failed to activate exam ${exam.id}: ${err}`);
      }
    }
  } catch (err) {
    result.errors.push(`syncExamStatuses error: ${err}`);
  }

  return result;
}
