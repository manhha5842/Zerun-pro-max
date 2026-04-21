import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "./client.js";

async function main() {
  const passwordHash = await hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 12);

  await prisma.adminUser.upsert({
    where: { username: process.env.SEED_ADMIN_USERNAME ?? "admin" },
    update: {
      passwordHash,
      isActive: true
    },
    create: {
      username: process.env.SEED_ADMIN_USERNAME ?? "admin",
      passwordHash,
      displayName: "Quản trị Zerun",
      role: "admin"
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "installationId" },
    update: {},
    create: {
      key: "installationId",
      value: { id: randomUUID(), createdBy: "seed" }
    }
  });

  console.log("Seed xong. Tài khoản mặc định: admin / ChangeMe123! Hãy đổi mật khẩu trước khi public.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
