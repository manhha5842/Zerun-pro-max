import { prisma } from "./packages/db/src/index.ts";

const code = "MAN-1776674201246";
const content = await prisma.content.findUnique({
  where: { code },
  include: { publishAttempts: { orderBy: { createdAt: "desc" } } }
});
console.log(JSON.stringify(content, null, 2));
await prisma.$disconnect();
