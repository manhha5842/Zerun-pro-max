import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const prompt = createInterface({ input: stdin, output: stdout });

async function ask(label: string) {
  return (await prompt.question(label)).trim();
}

try {
  const apiIdText = await ask("Telegram API ID: ");
  const apiId = Number(apiIdText);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("API ID phải là số nguyên dương.");
  }

  const apiHash = await ask("Telegram API Hash: ");
  if (!apiHash) throw new Error("API Hash không được để trống.");

  const phoneNumber = await ask("Số điện thoại Telegram (ví dụ +84901234567): ");
  if (!phoneNumber.startsWith("+")) {
    throw new Error("Số điện thoại phải có mã quốc gia, ví dụ +84.");
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5
  });

  await client.start({
    phoneNumber: async () => phoneNumber,
    phoneCode: async () => ask("Mã đăng nhập Telegram vừa gửi: "),
    password: async () => ask("Mật khẩu xác minh hai bước (nếu có): "),
    onError: (error) => {
      console.error(`Telegram báo lỗi: ${error.message}`);
    }
  });

  const stringSession = client.session.save();
  stdout.write("\nĐăng nhập thành công. Dán chuỗi dưới đây vào ô StringSession:\n\n");
  stdout.write(`${stringSession}\n\n`);
  stdout.write("Cảnh báo: StringSession có quyền như tài khoản Telegram. Không gửi chuỗi này cho người khác.\n");

  const dialogs = await client.getDialogs({ limit: 50 });
  stdout.write("\n50 chat/channel gần nhất mà tài khoản có quyền truy cập:\n");
  for (const dialog of dialogs) {
    const entity = dialog.entity as { username?: string } | undefined;
    const reference = entity?.username ? `@${entity.username}` : dialog.id?.toString();
    stdout.write(`- ${dialog.name || "(không có tên)"}: ${reference || "(không lấy được ID)"}\n`);
  }
  await client.disconnect();
} finally {
  prompt.close();
}
