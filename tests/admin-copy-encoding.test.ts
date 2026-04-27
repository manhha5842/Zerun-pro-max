import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const copyFiles = [
  "apps/web-admin/src/pages/ContentsPage.tsx",
  "apps/web-admin/src/pages/ContentCollectionsPage.tsx",
  "apps/web-admin/src/pages/ContentDetailPage.tsx",
  "apps/web-admin/src/pages/HistoryPage.tsx",
  "apps/web-admin/src/pages/PendingCommentsPage.tsx",
  "apps/web-admin/src/pages/PostComposerPage.tsx",
  "apps/web-admin/src/pages/ConvertLinkToolPage.tsx",
  "apps/web-admin/src/pages/AccountsPage.tsx",
  "apps/web-admin/src/pages/SettingsPage.tsx",
  "apps/web-admin/src/components/Layout.tsx",
  "apps/web-admin/src/components/common/PostDataTable.tsx",
  "apps/api/src/app.ts"
] as const;

const brokenEncodingMarkers = [
  "\u00c3",
  "\u00c4",
  "\u00c2",
  "\ufffd",
  "\u00e1\u00ba",
  "\u00e1\u00bb"
];

const brokenVietnameseFragments = [
  "Dang tai",
  "Khong tai duoc",
  "Khong co",
  "Lich su",
  "Bo loc",
  "Trang thai",
  "Lam moi",
  "Tat ca",
  "Thanh cong",
  "Dang chay",
  "Cac lan",
  "he thong",
  "cho xu ly",
  "Quan ly",
  "hen gio",
  "chua gui",
  "xuat hien",
  "Nen tang",
  "Thoi gian",
  "Ma bai",
  "Tai khoan",
  "Noi dung",
  "Thao tac",
  "Gio hen",
  "Bai viet",
  "Dang lai"
];

const expectedVietnameseCopy: Record<(typeof copyFiles)[number], string[]> = {
  "apps/web-admin/src/pages/ContentsPage.tsx": [
    "Quản lý bài đăng",
    "Gộp bài viết và lịch đăng"
  ],
  "apps/web-admin/src/pages/ContentCollectionsPage.tsx": [
    "Kho lưu trữ",
    "Bài failed hoặc bài cần review sẽ xuất hiện tại đây.",
    "Thùng rác đang trống"
  ],
  "apps/web-admin/src/pages/ContentDetailPage.tsx": [
    "Thiết lập bài đăng",
    "Nền tảng",
    "Không tìm thấy nội dung."
  ],
  "apps/web-admin/src/pages/HistoryPage.tsx": [
    "Lịch sử",
    "Chỉ lưu các bài đã đăng thành công",
    "Bài đăng thành công sẽ xuất hiện ở đây.",
    "Trang trước"
  ],
  "apps/web-admin/src/pages/PendingCommentsPage.tsx": [
    "Comment chờ xử lý",
    "Hủy comment này?",
    "Comment hẹn giờ hoặc chưa gửi sẽ xuất hiện ở đây."
  ],
  "apps/web-admin/src/pages/PostComposerPage.tsx": [
    "Tạo bài viết",
    "Import hàng loạt",
    "Nhập caption tiếng Việt có dấu"
  ],
  "apps/web-admin/src/pages/ConvertLinkToolPage.tsx": [
    "Liên kết gốc",
    "Lí do thất bại",
    "Download Batch Custom Links.xlsx"
  ],
  "apps/web-admin/src/pages/AccountsPage.tsx": [
    "Tài khoản đăng",
    "session health",
    "Cần đăng nhập"
  ],
  "apps/web-admin/src/pages/SettingsPage.tsx": [
    "Cài đặt",
    "Chọn nhóm ở menu trái",
    "Đưa vào Kho lưu trữ"
  ],
  "apps/web-admin/src/components/Layout.tsx": [
    "Tạo bài đăng",
    "Quản lý bài đăng",
    "Chuyển đổi tự động",
    "Kho lưu trữ",
    "Cài đặt"
  ],
  "apps/web-admin/src/components/common/PostDataTable.tsx": [
    "Nội dung đầy đủ",
    "Comment của bài viết",
    "Chi tiết media"
  ],
  "apps/api/src/app.ts": [
    "Không tìm thấy nội dung.",
    "Cần cung cấp thời gian hẹn hợp lệ.",
    "Liên kết chuyển đổi",
    "Có link chưa hỗ trợ convert tự động"
  ]
};

function readCopyFile(file: (typeof copyFiles)[number]) {
  return readFileSync(join(process.cwd(), file), "utf8");
}

describe("admin Vietnamese copy encoding", () => {
  it("keeps targeted admin copy in readable UTF-8 Vietnamese", () => {
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
