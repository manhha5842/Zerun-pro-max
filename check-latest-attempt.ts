import { prisma } from "./packages/db/src/index.ts";

const attempt = await prisma.publishAttempt.findFirst({
  orderBy: { createdAt: "desc" },
  include: {
    content: { select: { code: true, originalText: true, status: true } },
    target: { select: { id: true, name: true, platform: true } }
  }
});

console.log(JSON.stringify(attempt, null, 2));
await prisma.$disconnect();
