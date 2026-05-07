const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  for (const proc of ['SAW&DB&WB&QCgate', 'MD&TF&PT&TMTT&FQC']) {
    console.log('\n=== ' + proc + ' 完整对比 (active vs inactive) ===');
    const all = await p.question.groupBy({
      by: ['level', 'type', 'isActive'],
      where: { process: proc },
      _count: true,
    });
    const map = {};
    for (const g of all) {
      const key = (g.level || 'null') + ' | ' + g.type;
      if (!map[key]) map[key] = { active: 0, inactive: 0 };
      if (g.isActive) map[key].active = g._count;
      else map[key].inactive = g._count;
    }
    for (const [key, v] of Object.entries(map).sort()) {
      console.log('  ' + key + ': active=' + v.active + ' inactive=' + v.inactive);
    }
  }

  await p.$disconnect();
})();
