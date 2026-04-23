import { prisma } from '../src/lib/prisma';

async function main() {
  const count = await prisma.question.count();
  const optCount = await prisma.questionOption.count();
  const eqCount = await prisma.examQuestion.count();
  console.log('Questions:', count);
  console.log('Options:', optCount);
  console.log('ExamQuestions:', eqCount);
  await prisma.$disconnect();
}

main();
