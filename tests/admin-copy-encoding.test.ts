import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const copyFiles = [
  "apps/web-admin/src/pages/AccountsPage.tsx",
  "apps/web-admin/src/pages/AccountSessionsPage.tsx",
  "apps/web-admin/src/pages/accountForms.tsx",
  "apps/web-admin/src/components/accounts/AddAccountDialog.tsx",
  "apps/web-admin/src/components/accounts/TelegramAccountForm.tsx",
  "apps/web-admin/src/components/accounts/XAccountForm.tsx",
  "apps/web-admin/src/api/client.ts",
  "apps/api/src/app.ts"
] as const;

const brokenEncodingMarkers = [
  "\u00c3",
  "\u00c4",
  "\u00c2",
  "\ufffd",
  "\u00e1\u00ba",
  "\u00e1\u00bb",
  "\u00c6",
  "\u00e2\u20ac",
  "\u0090",
  "\u0091",
  "\u0092",
  "\u0093"
];

const brokenVietnameseFragments = [
  "Dang nhap",
  "Khong tim thay",
  "Khong the",
  "Khong nhap",
  "Can dang nhap",
  "Chua kiem tra",
  "Tai khoan",
  "Them tai khoan",
  "Luu tai khoan",
  "Luu session",
  "Mo trinh duyet",
  "Trinh duyet",
  "Nen tang",
  "Kiem tra gan nhat",
  "Trang thai",
  "Thao tac",
  "Yeu cau that bai"
];

const expectedVietnameseCopy: Record<(typeof copyFiles)[number], string[]> = {
  "apps/web-admin/src/pages/AccountsPage.tsx": [
    "Quản lý tài khoản",
    "session health",
    "Đã đăng nhập",
    "Cần đăng nhập",
    "Chưa kiểm tra",
    "Đã mở trình duyệt đăng nhập.",
    "Đã tạo tài khoản",
    "Đã kiểm tra session.",
    "Phiên đăng nhập đang mở",
    "Lưu session",
    "Mở trình duyệt đăng nhập"
  ],
  "apps/web-admin/src/pages/AccountSessionsPage.tsx": [
    "Tổng hợp trạng thái session, checkpoint và health",
    "Chưa có tài khoản",
    "Tạo tài khoản ở trang Quản lý tài khoản trước khi kiểm tra session.",
    "Kiểm tra gần nhất"
  ],
  "apps/web-admin/src/pages/accountForms.tsx": [
    "Mẫu thêm tài khoản đăng",
    "Dùng để crawl hoặc lấy nội dung đầu vào.",
    "Vui lòng nhập tên hiển thị.",
    "Telegram",
    "apiId là bắt buộc.",
    "Session string là bắt buộc.",
    "Tài khoản",
    "đăng nhập qua trình duyệt riêng sau khi lưu."
  ],
  "apps/web-admin/src/components/accounts/AddAccountDialog.tsx": [
    "Thêm tài khoản",
    "Loại tài khoản",
    "Chọn nền tảng",
    "Đăng nhập",
    "Không thể tạo tài khoản.",
    "Đăng nhập qua trình duyệt",
    "Mật khẩu không bao giờ đi qua Zerun.",
    "Sẵn sàng kết nối",
    "Đặt tên tài khoản",
    "Ví dụ: Page bán hàng"
  ],
  "apps/web-admin/src/components/accounts/TelegramAccountForm.tsx": [
    "đăng nhập số điện thoại",
    "lấy API ID và API Hash",
    "Số điện thoại",
    "Không nhập mật khẩu Telegram vào đây.",
    "session string đã đăng nhập"
  ],
  "apps/web-admin/src/components/accounts/XAccountForm.tsx": [
    "X / Twitter đăng nhập qua trình duyệt riêng.",
    "mật khẩu không đi qua Zerun.",
    "Nếu X yêu cầu email, 2FA hoặc checkpoint",
    "bấm Lưu session"
  ],
  "apps/web-admin/src/api/client.ts": [
    "Yêu cầu thất bại"
  ],
  "apps/api/src/app.ts": [
    "Chưa có file session",
    "Quản lý tài khoản chỉ áp dụng cho tài khoản đăng của user.",
    "Không test tài khoản nguồn ở trang Quản lý tài khoản.",
    "Không tìm thấy tài khoản Facebook.",
    "Đã có phiên đăng nhập Facebook đang mở cho tài khoản này.",
    "Đã mở trình duyệt. Hãy đăng nhập Facebook thủ công rồi bấm Hoàn tất trong UI.",
    "Không tìm thấy phiên đăng nhập Facebook.",
    "Trình duyệt đăng nhập đã đóng trước khi hoàn tất.",
    "Đã lưu session Facebook vào tài khoản.",
    "Đã mở trình duyệt",
    "Hãy đăng nhập thủ công rồi bấm hoàn tất trong UI.",
    "Đã lưu session"
  ]
};

function readCopyFile(file: (typeof copyFiles)[number]) {
  return readFileSync(join(process.cwd(), file), "utf8");
}

describe("account/session Vietnamese copy encoding", () => {
  it("keeps account and browser-login copy in readable UTF-8 Vietnamese", () => {
    for (const file of copyFiles) {
      const source = readCopyFile(file);

      for (const marker of brokenEncodingMarkers) {
        expect(source, `${file} contains mojibake marker ${marker}`).not.toContain(marker);
      }

      for (const fragment of brokenVietnameseFragments) {
        expect(source, `${file} contains unaccented Vietnamese copy: ${fragment}`).not.toContain(fragment);
      }

      for (const phrase of expectedVietnameseCopy[file]) {
        expect(source, `${file} should keep Vietnamese phrase: ${phrase}`).toContain(phrase);
      }
    }
  });
});
