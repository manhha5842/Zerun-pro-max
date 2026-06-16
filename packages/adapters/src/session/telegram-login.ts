import { Api, TelegramClient } from "telegram";
import { computeCheck } from "telegram/Password.js";
import { StringSession } from "telegram/sessions/index.js";

export type TelegramLoginStatus = "code_sent" | "password_required" | "completed";

export type TelegramDialogOption = {
  id: string;
  name: string;
  reference: string;
  username?: string;
  type: "group" | "channel";
};

export type TelegramLoginPublicResult = {
  status: Exclude<TelegramLoginStatus, "completed">;
  phoneNumber: string;
  isCodeViaApp?: boolean;
  displayName?: string;
  username?: string;
};

export type TelegramLoginCompletedResult = {
  status: "completed";
  phoneNumber: string;
  displayName?: string;
  username?: string;
  apiId: number;
  apiHash: string;
  sessionString: string;
  dialogs: TelegramDialogOption[];
};

type PendingTelegramLogin = {
  client: TelegramClient;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash: string;
  isCodeViaApp: boolean;
  createdAt: number;
};

const LOGIN_TTL_MS = 15 * 60 * 1000;
const DIALOG_CONNECT_ATTEMPTS = 3;
const pendingLogins = new Map<string, PendingTelegramLogin>();

export async function startTelegramLogin(
  key: string,
  input: { apiId: number; apiHash: string; phoneNumber: string }
): Promise<TelegramLoginPublicResult> {
  cleanupExpiredLogins();
  await cancelTelegramLogin(key);

  const apiId = Number(input.apiId);
  const apiHash = input.apiHash.trim();
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("Telegram API ID phải là số nguyên dương.");
  }
  if (!apiHash) throw new Error("Cần nhập Telegram API Hash.");
  if (!phoneNumber) throw new Error("Cần nhập số điện thoại Telegram theo mã quốc gia, ví dụ +84901234567.");

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3
  });

  try {
    await client.connect();
    const sent = await client.sendCode({ apiId, apiHash }, phoneNumber);
    if (!sent.phoneCodeHash) throw new Error("Telegram không trả về mã phiên xác thực.");

    pendingLogins.set(key, {
      client,
      apiId,
      apiHash,
      phoneNumber,
      phoneCodeHash: sent.phoneCodeHash,
      isCodeViaApp: sent.isCodeViaApp,
      createdAt: Date.now()
    });

    return {
      status: "code_sent",
      phoneNumber,
      isCodeViaApp: sent.isCodeViaApp
    };
  } catch (error) {
    await client.disconnect().catch(() => undefined);
    throw new Error(readableTelegramError(error));
  }
}

export async function submitTelegramLoginCode(
  key: string,
  code: string
): Promise<TelegramLoginPublicResult | TelegramLoginCompletedResult> {
  const login = requirePendingLogin(key);
  const phoneCode = code.trim();
  if (!phoneCode) throw new Error("Cần nhập mã OTP Telegram.");

  try {
    const result = await login.client.invoke(new Api.auth.SignIn({
      phoneNumber: login.phoneNumber,
      phoneCodeHash: login.phoneCodeHash,
      phoneCode
    }));

    if (result instanceof Api.auth.AuthorizationSignUpRequired) {
      throw new Error("Số điện thoại này chưa có tài khoản Telegram. Hãy tạo tài khoản trên ứng dụng Telegram trước.");
    }

    return finalizeTelegramLogin(key, login);
  } catch (error) {
    if (telegramErrorCode(error) === "SESSION_PASSWORD_NEEDED") {
      return {
        status: "password_required",
        phoneNumber: login.phoneNumber
      };
    }
    throw new Error(readableTelegramError(error));
  }
}

export async function submitTelegramLoginPassword(
  key: string,
  password: string
): Promise<TelegramLoginCompletedResult> {
  const login = requirePendingLogin(key);
  if (!password) throw new Error("Cần nhập mật khẩu xác minh hai bước của Telegram.");

  try {
    const passwordInfo = await login.client.invoke(new Api.account.GetPassword());
    const passwordCheck = await computeCheck(passwordInfo, password);
    await login.client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
    return finalizeTelegramLogin(key, login);
  } catch (error) {
    throw new Error(readableTelegramError(error));
  }
}

export async function cancelTelegramLogin(key: string): Promise<void> {
  const login = pendingLogins.get(key);
  pendingLogins.delete(key);
  if (login) await login.client.disconnect().catch(() => undefined);
}

export async function listTelegramDialogs(credentials: Record<string, unknown>): Promise<TelegramDialogOption[]> {
  const apiId = Number(credentials.apiId);
  const apiHash = String(credentials.apiHash ?? "").trim();
  const sessionString = String(credentials.session ?? credentials.sessionString ?? "").trim();
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash || !sessionString) {
    throw new Error("Tài khoản Telegram chưa hoàn tất đăng nhập.");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= DIALOG_CONNECT_ATTEMPTS; attempt += 1) {
    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 500
    });
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        throw new Error("Phiên Telegram đã hết hạn. Hãy kết nối lại tài khoản.");
      }
      return await readDialogOptions(client);
    } catch (error) {
      lastError = error;
      if (!isDisconnectedError(error) || attempt === DIALOG_CONNECT_ATTEMPTS) {
        throw new Error(readableTelegramError(error));
      }
      await sleep(250 * attempt);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  throw new Error(readableTelegramError(lastError));
}

async function finalizeTelegramLogin(
  key: string,
  login: PendingTelegramLogin
): Promise<TelegramLoginCompletedResult> {
  const me = await login.client.getMe();
  const dialogs = await readDialogOptions(login.client).catch(() => []);
  const sessionString = (login.client.session as StringSession).save();
  const displayName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();

  pendingLogins.delete(key);
  await login.client.disconnect().catch(() => undefined);

  return {
    status: "completed",
    apiId: login.apiId,
    apiHash: login.apiHash,
    phoneNumber: login.phoneNumber,
    sessionString,
    dialogs,
    displayName: displayName || undefined,
    username: me.username || undefined
  };
}

async function readDialogOptions(client: TelegramClient): Promise<TelegramDialogOption[]> {
  const dialogs = await client.getDialogs({ limit: 100 });
  return dialogs
    .filter((dialog) => dialog.isGroup || dialog.isChannel)
    .map((dialog) => {
      const entity = dialog.entity as { username?: string } | undefined;
      const username = entity?.username?.trim();
      const id = dialog.id?.toString() ?? "";
      return {
        id,
        name: dialog.title || dialog.name || username || id,
        reference: username ? `@${username}` : id,
        username,
        type: dialog.isGroup ? "group" as const : "channel" as const
      };
    })
    .filter((dialog) => Boolean(dialog.id && dialog.reference));
}

function requirePendingLogin(key: string): PendingTelegramLogin {
  cleanupExpiredLogins();
  const login = pendingLogins.get(key);
  if (!login) throw new Error("Phiên xác thực Telegram đã hết hạn. Hãy gửi lại mã OTP.");
  return login;
}

function cleanupExpiredLogins() {
  const now = Date.now();
  for (const [key, login] of pendingLogins) {
    if (now - login.createdAt <= LOGIN_TTL_MS) continue;
    pendingLogins.delete(key);
    void login.client.disconnect().catch(() => undefined);
  }
}

function normalizePhoneNumber(value: string) {
  const phoneNumber = value.replace(/[\s().-]/g, "").trim();
  return /^\+[1-9]\d{6,14}$/.test(phoneNumber) ? phoneNumber : "";
}

function telegramErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { errorMessage?: unknown; message?: unknown };
  return String(candidate.errorMessage ?? candidate.message ?? "").toUpperCase();
}

function isDisconnectedError(error: unknown) {
  return telegramErrorCode(error).includes("DISCONNECTED");
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function readableTelegramError(error: unknown): string {
  const code = telegramErrorCode(error);
  if (code.includes("PHONE_CODE_INVALID")) return "Mã OTP Telegram không đúng.";
  if (code.includes("PHONE_CODE_EXPIRED")) return "Mã OTP Telegram đã hết hạn. Hãy gửi lại mã.";
  if (code.includes("PASSWORD_HASH_INVALID")) return "Mật khẩu xác minh hai bước không đúng.";
  if (code.includes("PHONE_NUMBER_INVALID")) return "Số điện thoại Telegram không hợp lệ.";
  if (code.includes("API_ID_INVALID")) return "Telegram API ID hoặc API Hash không hợp lệ.";
  if (code.includes("FLOOD_WAIT")) return "Telegram đang giới hạn yêu cầu. Hãy chờ một lúc rồi thử lại.";
  if (code.includes("DISCONNECTED")) return "Kết nối Telegram bị gián đoạn. Hãy bấm Tải lại danh sách.";
  if (error instanceof Error && error.message) return error.message;
  return "Không thể xác thực tài khoản Telegram.";
}
