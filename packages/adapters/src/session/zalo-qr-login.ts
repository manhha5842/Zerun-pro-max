import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LoginQRCallbackEventType, Zalo, type LoginQRCallbackEvent } from "zca-js";
import type { PrismaClient } from "@zerun/db";
import { ensureProfileDir, upsertSession, type ProfileRef } from "./profile-store.js";

export type ZaloQrLoginResult = {
  ok: boolean;
  qrPath?: string;
  error?: string;
};

export type ZaloCredentials = {
  imei: string;
  userAgent: string;
  cookie: unknown;
  language?: string;
};

/**
 * Đăng nhập Zalo bằng QR và lưu credentials vào PlatformSession.data.
 * Ảnh QR được lưu trong profile để API có thể phục vụ trực tiếp cho UI.
 */
export async function zaloQrLogin(
  prisma: PrismaClient,
  ref: ProfileRef,
  storageRoot?: string
): Promise<ZaloQrLoginResult> {
  const dir = ensureProfileDir(ref, storageRoot);
  const qrPath = join(dir, "qr.png");

  if (existsSync(qrPath)) rmSync(qrPath, { force: true });
  await upsertSession(prisma, ref, {
    status: "open_for_login",
    sessionData: { qrReady: false, qrUpdatedAt: null }
  });

  return new Promise<ZaloQrLoginResult>((resolve) => {
    const zalo = new Zalo();
    let terminalError: string | undefined;

    zalo
      .loginQR({ userAgent: defaultUserAgent(), qrPath }, (event: LoginQRCallbackEvent) => {
        if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
          void event.actions
            .saveToFile(qrPath)
            .then(() =>
              upsertSession(prisma, ref, {
                status: "open_for_login",
                sessionData: {
                  qrReady: true,
                  qrUpdatedAt: new Date().toISOString()
                }
              })
            )
            .catch((error: unknown) =>
              upsertSession(prisma, ref, {
                status: "login_failed",
                sessionData: {
                  qrReady: false,
                  error: errorMessage(error)
                }
              })
            );
          return;
        }

        if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
          terminalError = "Mã QR đã hết hạn. Hãy bấm Tạo lại QR.";
          if (existsSync(qrPath)) rmSync(qrPath, { force: true });
          void upsertSession(prisma, ref, {
            status: "login_failed",
            sessionData: {
              qrReady: false,
              qrUpdatedAt: null,
              error: terminalError
            }
          });
          event.actions.abort();
          return;
        }

        if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
          void upsertSession(prisma, ref, {
            status: "open_for_login",
            sessionData: {
              qrReady: true,
              qrUpdatedAt: new Date().toISOString(),
              scanned: true,
              displayName: event.data.display_name
            }
          });
          return;
        }

        if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
          terminalError = "Yêu cầu đăng nhập QR đã bị từ chối trên điện thoại.";
          void upsertSession(prisma, ref, {
            status: "login_failed",
            sessionData: {
              qrReady: false,
              qrUpdatedAt: null,
              error: terminalError
            }
          });
          event.actions.abort();
        }
      })
      .then(async (api) => {
        const ctx = api.getContext();
        const credentials: ZaloCredentials = {
          imei: ctx.imei,
          userAgent: ctx.userAgent,
          cookie: ctx.cookie.toJSON()
        };
        await upsertSession(prisma, ref, {
          status: "login_ok",
          sessionData: { credentials, qrReady: false }
        });
        if (ref.accountKind === "source") {
          await prisma.sourceAccount.update({
            where: { id: ref.accountId },
            data: { credentials: credentials as never, health: "healthy" }
          }).catch(() => undefined);
        } else {
          await prisma.targetAccount.update({
            where: { id: ref.accountId },
            data: { credentials: credentials as never, health: "healthy" }
          }).catch(() => undefined);
        }
        resolve({ ok: true, qrPath });
      })
      .catch(async (error: unknown) => {
        const message = terminalError ?? errorMessage(error);
        await upsertSession(prisma, ref, {
          status: "login_failed",
          sessionData: {
            qrReady: false,
            qrUpdatedAt: null,
            error: message
          }
        });
        resolve({ ok: false, error: message });
      });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultUserAgent(): string {
  return (
    process.env.ZALO_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
}
