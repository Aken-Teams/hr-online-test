import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { generateExamResultPdf } from '@/lib/pdf-generator';
import type { PdfSessionData, PdfQuestionData } from '@/lib/pdf-generator';
import { ZipArchive } from 'archiver';

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionIds, examId } = body as { sessionIds: string[]; examId: string };

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择至少一个考试会话' },
        { status: 400 }
      );
    }


    // Fetch all sessions with full data
    const sessions = await prisma.examSession.findMany({
      where: {
        id: { in: sessionIds },
        ...(examId ? { examId } : {}),
      },
      include: {
        exam: {
          select: {
            title: true,
            totalScore: true,
            passScore: true,
          },
        },
        user: {
          select: {
            name: true,
            employeeNo: true,
            department: true,
          },
        },
        result: true,
        answers: {
          include: {
            question: {
              include: {
                options: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: '未找到考试会话' },
        { status: 404 }
      );
    }

    // Build PDF data for each session
    const pdfDataList: { data: PdfSessionData; fileName: string }[] = [];

    for (const session of sessions) {
      // Load this session's exam questions for question order and points
      const questionOrder = session.questionOrder as string[] | null;
      const sessionQuestionIds =
        questionOrder && Array.isArray(questionOrder) ? questionOrder : [];

      // When questionOrder exists, use it as the authoritative list of assigned questions.
      // When it's null (older sessions), we can only reliably show answered questions —
      // the full ExamQuestion pool may be much larger than what was assigned.
      const answeredMap = new Map(
        session.answers.map((a) => [a.questionId, a])
      );

      const questionIds = sessionQuestionIds.length > 0
        ? sessionQuestionIds
        : Array.from(answeredMap.keys());

      const examQuestions = await prisma.examQuestion.findMany({
        where: {
          examId: session.examId,
          questionId: { in: questionIds },
        },
        select: { questionId: true, points: true },
      });
      const pointsMap = new Map(examQuestions.map((eq) => [eq.questionId, eq.points]));

      // Find unanswered question IDs so we can load their data
      const unansweredIds = questionIds.filter((qid) => !answeredMap.has(qid));
      const unansweredQuestions = unansweredIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: unansweredIds } },
            include: { options: { orderBy: { sortOrder: 'asc' } } },
          })
        : [];
      const unansweredMap = new Map(unansweredQuestions.map((q) => [q.id, q]));

      // Build question list in order
      const questions: PdfQuestionData[] = questionIds.map((qid) => {
        const answer = answeredMap.get(qid);
        if (answer) {
          return {
            questionType: answer.question.type,
            content: answer.question.content,
            yourAnswer: answer.answerContent,
            correctAnswer: answer.question.correctAnswer,
            referenceAnswer: answer.question.referenceAnswer,
            earnedPoints: answer.earnedPoints ?? 0,
            maxPoints: pointsMap.get(qid) ?? answer.question.points,
            isCorrect: answer.isCorrect,
            options: answer.question.options.map((o) => ({
              label: o.label,
              content: o.content,
            })),
          };
        }
        // Unanswered question — load from DB
        const q = unansweredMap.get(qid);
        return {
          questionType: q?.type ?? 'UNKNOWN',
          content: q?.content ?? '(题目数据缺失)',
          yourAnswer: null,
          correctAnswer: q?.correctAnswer ?? null,
          referenceAnswer: q?.referenceAnswer ?? null,
          earnedPoints: 0,
          maxPoints: pointsMap.get(qid) ?? q?.points ?? 0,
          isCorrect: false,
          options: q?.options.map((o) => ({ label: o.label, content: o.content })) ?? [],
        };
      });

      // Also include questions that have answers but aren't in questionIds
      for (const answer of session.answers) {
        if (!questionIds.includes(answer.questionId)) {
          questions.push({
            questionType: answer.question.type,
            content: answer.question.content,
            yourAnswer: answer.answerContent,
            correctAnswer: answer.question.correctAnswer,
            referenceAnswer: answer.question.referenceAnswer,
            earnedPoints: answer.earnedPoints ?? 0,
            maxPoints: pointsMap.get(answer.questionId) ?? answer.question.points,
            isCorrect: answer.isCorrect,
            options: answer.question.options.map((o) => ({
              label: o.label,
              content: o.content,
            })),
          });
        }
      }

      const pdfData: PdfSessionData = {
        exam: {
          title: session.exam.title,
          totalScore: session.exam.totalScore,
          passScore: session.exam.passScore,
        },
        employee: {
          name: session.user.name,
          employeeNo: session.user.employeeNo,
          department: session.user.department,
        },
        submittedAt: session.submittedAt?.toISOString() ?? null,
        result: session.result
          ? {
              totalScore: session.result.totalScore,
              correctCount: session.result.correctCount,
              totalQuestions: session.result.totalQuestions,
              timeTakenSeconds: session.result.timeTakenSeconds,
              isPassed: session.result.isPassed,
              gradeLabel: session.result.gradeLabel,
            }
          : null,
        questions,
      };

      const safeName = session.user.name.replace(/[\\/:*?"<>|]/g, '_');
      pdfDataList.push({
        data: pdfData,
        fileName: `${safeName}_${session.user.employeeNo}.pdf`,
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'PDF_EXPORTED',
        details: {
          examId,
          exportedCount: pdfDataList.length,
          sessionIds,
        },
      },
    });

    // Single PDF
    if (pdfDataList.length === 1) {
      const pdfBuffer = await generateExamResultPdf(pdfDataList[0].data);
      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(pdfDataList[0].fileName)}"`,
          'Content-Length': String(pdfBuffer.length),
        },
      });
    }

    // Multiple PDFs → ZIP
    const archive = new ZipArchive({ zlib: { level: 5 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    for (const item of pdfDataList) {
      const pdfBuffer = await generateExamResultPdf(item.data);
      archive.append(pdfBuffer, { name: item.fileName });
    }

    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);

    const examTitle = sessions[0].exam.title.replace(/[\\/:*?"<>|]/g, '_');
    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(`${examTitle}_试卷.zip`)}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('Export PDF error:', error);
    return NextResponse.json(
      { success: false, error: '导出 PDF 失败' },
      { status: 500 }
    );
  }
}
