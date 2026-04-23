import { prisma } from '../src/lib/prisma';

async function main() {
  // Delete in correct order for foreign key constraints
  const eq = await prisma.examQuestion.deleteMany({});
  console.log('ExamQuestions deleted:', eq.count);

  const opt = await prisma.questionOption.deleteMany({});
  console.log('Options deleted:', opt.count);

  const q = await prisma.question.deleteMany({});
  console.log('Questions deleted:', q.count);

  await prisma.$disconnect();
  console.log('Done. Question bank cleared.');
}

main();
