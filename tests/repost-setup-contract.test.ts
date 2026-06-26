import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("repost account setup contract", () => {
  it("logs Telegram in through OTP and saves the credential keys consumed by the adapter", () => {
    const sourcePage = read("apps/web-admin/src/pages/SourceAccountsPage.tsx");
    const targetPage = read("apps/web-admin/src/pages/TargetAccountsPage.tsx");
    const setupPage = read("apps/web-admin/src/components/accounts/RepostAccountsPage.tsx");
    const apiApp = read("apps/api/src/app.ts");

    expect(sourcePage).toContain('<RepostAccountsPage kind="source" />');
    expect(targetPage).toContain('<RepostAccountsPage kind="target" />');
    expect(setupPage).toContain("/session/telegram/start");
    expect(setupPage).toContain("/session/telegram/code");
    expect(setupPage).toContain("/session/telegram/password");
    expect(setupPage).toContain("phoneNumber: form.phoneNumber.replace");
    expect(setupPage).not.toContain("<Label>StringSession</Label>");
    expect(setupPage).toContain("...(currentAccount?.credentials ?? {})");
    expect(setupPage).toContain('const endpointKey = isSource ? "source" : "target"');
    expect(setupPage).not.toContain("/telegram-dialogs");
    expect(setupPage).not.toContain("Chọn nhóm hoặc kênh Telegram");
    expect(setupPage).toContain("App sẽ tự tạo StringSession");
    expect(setupPage).toContain("<AccountChannelsManager role={kind} />");
    expect(read("apps/web-admin/src/components/accounts/AccountChannelsManager.tsx")).toContain("/channel-options");
    expect(apiApp).toContain("function omitTelegramSession");
    expect(apiApp).toContain("_existingCredentials: current.credentials");
    const telegramLogin = read("packages/adapters/src/session/telegram-login.ts");
    expect(telegramLogin).toContain("DIALOG_CONNECT_ATTEMPTS = 3");
    expect(telegramLogin).toContain("isDisconnectedError(error)");
  });

  it("only exposes the supported Telegram and Zalo personal setup choices", () => {
    const setupPage = read("apps/web-admin/src/components/accounts/RepostAccountsPage.tsx");
    const sharedTypes = read("packages/shared/src/types.ts");
    const apiApp = read("apps/api/src/app.ts");

    expect(setupPage).toContain('platform: "telegram" | "zalo-personal"');
    expect(setupPage).toContain('platform: "zalo-personal"');
    expect(setupPage).not.toContain('platform: "facebook"');
    expect(sharedTypes).toContain('["telegram", "x", "threads", "instagram", "facebook", "zalo-personal"]');
    expect(apiApp).toContain("isSupportedAccountPlatform");
    expect(apiApp).toContain("UNSUPPORTED_PLATFORM");
  });

  it("creates Zalo as an inactive draft, opens QR, then manages channels separately", () => {
    const setupPage = read("apps/web-admin/src/components/accounts/RepostAccountsPage.tsx");
    const apiClient = read("apps/web-admin/src/api/client.ts");
    const qrLogin = read("packages/adapters/src/session/zalo-qr-login.ts");

    expect(setupPage).toContain("isActive: false");
    expect(setupPage).toContain("/session/create");
    expect(setupPage).toContain("/session/zalo-qr");
    expect(setupPage).toContain("apiAssetUrl(`/accounts/${kind}/${accountId}/session/qr.png");
    expect(apiClient).toContain("const DEFAULT_API_BASE = \"/api/v1\"");
    expect(apiClient).toContain("window.location.hostname}:3001/api/v1");
    expect(apiClient).toContain("const hasBody = init.body !== undefined && init.body !== null");
    expect(qrLogin).toContain("LoginQRCallbackEventType.QRCodeGenerated");
    expect(qrLogin).toContain(".saveToFile(qrPath)");
    expect(qrLogin).toContain("qrReady: true");
    expect(setupPage).toContain("Lưu và mở QR");
    expect(setupPage).not.toContain("Tên gợi nhớ");
    expect(setupPage).not.toContain("Chưa cần nhập `threadId`");
    expect(setupPage).not.toContain("Ngành nội dung thường có");
    expect(setupPage).not.toContain("Ngành được phép nhận");
    expect(setupPage).not.toContain("Lưu nhóm và tiếp tục");
    expect(setupPage).toContain("Nhóm và kênh không cấu hình ở đây");
    const channelManager = read("apps/web-admin/src/components/accounts/AccountChannelsManager.tsx");
    expect(channelManager).toContain("Quản lý kênh nguồn");
    expect(channelManager).toContain("Quản lý kênh đích");
    expect(channelManager).toContain("Vẫn nhận nội dung tổng quát");
  });

  it("treats login accounts as shared accounts, with source/target only as channel roles", () => {
    const channelsPage = read("apps/web-admin/src/pages/ChannelsManagementPage.tsx");
    const channelManager = read("apps/web-admin/src/components/accounts/AccountChannelsManager.tsx");
    const apiApp = read("apps/api/src/app.ts");

    expect(channelsPage).toContain("loginAccountKey");
    expect(channelsPage).toContain("toLoginAccountKey(account)");
    expect(channelsPage).not.toContain('if (wizard.role === "source" && account.accountKind !== "source") return false;');
    expect(channelsPage).not.toContain("{roleLabel(account.accountKind)}");
    expect(channelManager).toContain("toLoginAccountKey(account)");
    expect(channelManager).not.toContain('role === "source" ? all.filter((account) => account.accountKind === "source") : all');
    expect(apiApp).toContain("findReusableAccount");
    expect(apiApp).toContain("resolveChannelOptionAccount");
  });

  it("uses the Shopee extension bridge instead of a CDP browser session", () => {
    const apiApp = read("apps/api/src/app.ts");
    const bridge = read("apps/api/src/zerun-extension-bridge.ts");
    const convertTool = read("apps/web-admin/src/pages/ConvertLinkToolPage.tsx");
    const extensionApi = read("extensions/shopee-affiliate-zerun/js/affiliate-api.js");

    expect(apiApp).toContain("/tools/convert-link/extension-convert");
    expect(bridge).toContain("CONVERT_LINK");
    expect(bridge).toContain("NEED_LOGIN");
    expect(convertTool).toContain("Convert link Shopee");
    expect(convertTool).toContain("Extension:");
    expect(convertTool).not.toContain("/browser-sessions");
    expect(convertTool).not.toContain("Kết nối Edge");
    expect(convertTool).not.toContain("Ngắt kết nối");
    expect(extensionApi).toContain("async function findAffiliateTabForConvert");
    expect(extensionApi).toContain("active: true");
  });

  it("resolves shortlinks through HTTP redirects before affiliate conversion", () => {
    const apiApp = read("apps/api/src/app.ts");
    const contentProcessor = read("packages/worker-core/src/processors/content-process.ts");

    expect(apiApp).toContain("expandUrl(url, followRedirectUrl)");
    expect(apiApp).toContain("detectNetwork(resolvedUrl)");
    expect(apiApp).toContain("originalUrl: url");
    expect(apiApp).toContain("resolvedUrl");
    expect(contentProcessor).toContain("expandUrl(link.url, followRedirectUrl)");
    expect(contentProcessor).toContain("detectNetwork(resolvedUrl)");
    expect(contentProcessor).toContain("shouldUseResolvedUrl");
    expect(contentProcessor).toContain("url: conversionUrl");
    expect(contentProcessor).toContain("originalUrl: link.url");
    expect(contentProcessor).not.toContain("subId: content.code");
  });

  it("uses a compact pipeline backed by channel repost flows", () => {
    const flowPage = read("apps/web-admin/src/pages/RepostFlowPage.tsx");

    expect(flowPage).toContain("Pipeline mặc định");
    expect(flowPage).not.toContain("<ReactFlow");
    expect(flowPage).toContain("/repost-flows");
    expect(flowPage).toContain("sourceChannelIds");
    expect(flowPage).toContain("targetChannelIds");
    expect(flowPage).toContain("Danh sách Flow");
    expect(flowPage).toContain("Nguồn đang lấy tin");
    expect(flowPage).toContain("Lịch sử lấy nguồn tin");
    expect(flowPage).toContain("Đã reup / đang đăng");
    expect(flowPage).toContain("Kênh đích của flow");
    expect(flowPage).toContain("Flow này đăng vào");
    expect(flowPage).not.toContain("Dùng tất cả kênh đích active");
    expect(flowPage).not.toContain("Phạm vi đăng");
    expect(flowPage).not.toContain("targetScope");
    expect(flowPage).toContain("Nguồn → Gom tin → AI → Đổi link → Route → Đăng");
    expect(flowPage).toContain("Kênh đích");
    expect(flowPage).not.toContain("source channels");
    expect(flowPage).not.toContain("processing steps");
    expect(flowPage).not.toContain("Duplicate detection");
    expect(flowPage).not.toContain("Link & domain rules");
    expect(flowPage).not.toContain("Bật lọc trùng");
    expect(flowPage).not.toContain("Cần keyword deal");
    expect(flowPage).not.toContain("persistNodeConfig");
    expect(flowPage).not.toContain("localStorage");
  });

  it("keeps the setup guide and checklist in readable Vietnamese", () => {
    const setupGuide = read("apps/web-admin/src/components/common/SetupGuide.tsx");
    const checklist = read("docs/repost-setup-readiness-checklist.md");

    expect(setupGuide).toContain("Hướng dẫn thiết lập");
    expect(setupGuide).toContain("Hoàn tất khi:");
    expect(checklist).toContain("Checklist thiết lập đăng lại");
    expect(checklist).toContain("Zalo cá nhân nguồn");
    expect(checklist).toContain("Tiếng Việt có dấu");
  });
});
