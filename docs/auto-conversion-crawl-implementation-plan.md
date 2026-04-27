# Auto Conversion & Crawl Implementation Plan

Tài liệu này là plan triển khai tuần tự cho Web Admin/API/Worker sau khi chốt lại sitemap mới. Khi tạo hoặc cập nhật plan cho project này, phải viết đủ chi tiết; chỗ nào chưa đủ thông tin để quyết định thì hỏi lại trước khi tự suy diễn.

## Mục tiêu

- **Đăng bài thủ công/import**: user tạo bài đơn lẻ hoặc bulk import Excel/CSV/media zip trong cùng trang `Tạo bài đăng`.
- **Quản lý bài đăng**: gộp bài đang chờ đăng và lịch đăng vào một trang, có 2 mode `table` và `calendar`, click row để expand nội dung, media, comment và trạng thái comment.
- **Lịch sử**: lưu các bài/lần đăng đã chạy xong, bao gồm link kết quả, lỗi và comment kèm theo.
- **Kho lưu trữ**: lưu bài failed hoặc bài cần review thủ công, ví dụ link chưa hỗ trợ convert, account checkpoint, retry timeout, mất mạng.
- **Thùng rác**: lưu bài đã hủy/xóa mềm; không hiển thị cột lý do.
- **Chuyển đổi tự động**: tự lấy bài mới từ nguồn, xử lý content/media/link, rewrite/xóa link theo rule hoặc AI, rồi đăng ngay hoặc lên lịch sang nhiều tài khoản đích.
- **Crawl dữ liệu**: user nhập nguồn crawl thủ công, cấu hình media/comment/storage, chạy crawl, lưu lịch sử crawl và bảng kết quả crawl.
- **Convert link affiliate thủ công**: user nhập nội dung hoặc Excel, hệ thống xuất file `Batch Custom Links.xlsx`, user import CSV kết quả, hệ thống thay link và trả lại nội dung/file cuối.

## Quyết định đã chốt

- Không dùng UI `Facebook nâng cao`, `Lô đăng Facebook`, `Chi tiết lô đăng`.
- Facebook chỉ là một nền tảng trong flow đăng bài chung.
- Không có page `Tài khoản nguồn` độc lập; source/session nằm trong Auto Conversion hoặc Crawl.
- `Tài khoản đăng` và `Session / Health` gộp thành một trang table có filter đầy đủ.
- `Bài viết` và `Lịch đăng` gộp thành `Quản lý bài đăng`.
- Không tạo trang chi tiết bài viết riêng; detail hiển thị bằng expand row trong `Quản lý bài đăng`.
- `Comment chờ` không còn là page độc lập; comment và trạng thái comment nằm trong `Quản lý bài đăng` và `Lịch sử`.
- `Lịch sử đăng` đổi tên thành `Lịch sử`.
- `Bài viết đã lưu` đổi tên thành `Kho lưu trữ`.
- Bài failed chuyển vào `Kho lưu trữ`; không hiển thị retry count hoặc lịch sử retry gần nhất ở page này.
- Bài bị hủy/xóa chuyển vào `Thùng rác`; page này không có cột lý do.
- Link chưa hỗ trợ convert mặc định đưa bài vào `Kho lưu trữ`, không tự đăng.
- Auto Conversion rule là `1 nguồn -> nhiều tài khoản đích`.
- UI dùng shadcn làm component library chính, ưu tiên wrapper và token hiện tại của admin.
- Không chia task theo tuần/thời gian; agent implement tuần tự theo dependency đến khi xong.

## Sitemap cuối cùng

```text
Tổng quan
- Dashboard

Đăng bài
- Tạo bài đăng
- Quản lý bài đăng
- Lịch sử
- Kho lưu trữ
- Thùng rác

Chuyển đổi tự động
- Cấu hình chuyển đổi tự động
- Lịch sử chuyển đổi tự động

Crawl dữ liệu
- Crawl dữ liệu
- Lịch sử crawl
- Kết quả crawl

Công cụ
- Convert link affiliate

Tài khoản
- Tài khoản đăng

Hệ thống
- Cài đặt
- Worker jobs / Logs
```

Routes chính:

```text
/dashboard
/contents/new
/contents
/history
/contents/archive
/contents/trash
/auto-conversion/rules
/auto-conversion/history
/crawl
/crawl/history
/crawl/results
/tools/convert-link
/accounts
/settings
/worker-jobs
```

Routes cũ chỉ redirect, không expose sidebar:

```text
/contents/:code -> /contents
/contents/:code/edit -> /contents
/schedules -> /contents
/pending-comments -> /contents
/accounts/sessions -> /accounts
/contents/saved -> /contents/archive
/failed -> /contents/archive
/import -> /contents/new
```

## Thứ tự implement

1. Chuẩn hóa nền UI/shadcn: alias `@/*`, `cn`, primitives trong `components/ui`, shared table/filter/bulk/file/dialog/status.
2. Cập nhật router/sidebar theo sitemap cuối cùng, đưa nhóm `Đăng bài` lên trên `Chuyển đổi tự động`.
3. Cập nhật mock API đủ dữ liệu cho toàn bộ web: account/session health, bài scheduled/ready/failed/published/trashed, comment queues, auto conversion, crawl, settings.
4. Cập nhật API thật để `/contents` trả kèm target publish attempts và `commentQueues`, hỗ trợ bulk action theo filter.
5. Cập nhật `Quản lý bài đăng`: table view, calendar view, filter/search/sort/page size, selection, chọn tất cả khớp filter, pause/resume/cancel/move archive/trash, expand row xem comment.
6. Cập nhật `Tài khoản đăng`: table gộp session health, filter theo keyword/platform/health/auth state/active, action test/check/login/delete.
7. Cập nhật `Lịch sử`: title mới, list publish attempts, expand comment theo attempt.
8. Cập nhật `Kho lưu trữ`: filter đầy đủ, chỉ hiển thị saved/failed, bỏ retry count và retry history.
9. Cập nhật `Thùng rác`: bỏ lý do, giữ restore/delete forever.
10. Cập nhật `Cài đặt`: layout dạng tab/menu bên trái, form cấu hình bên phải cho AI, Cloudinary, Affiliate, Telegram.
11. Giữ Auto Conversion/Crawl/Convert link affiliate theo plan ban đầu nhưng đồng bộ wording `Kho lưu trữ`.
12. Chạy typecheck, test, build và test copy tiếng Việt UTF-8.

## Acceptance criteria

- Sidebar đúng thứ tự và không còn page `Comment chờ`, `Lịch đăng`, `Session / Health`, campaign Facebook.
- `Quản lý bài đăng` có table/calendar mode và expand row xem được comment + trạng thái comment.
- `Tài khoản đăng` gộp account và session health trong một table có filter đầy đủ.
- `Lịch sử` là nơi xem bài/lần đăng đã chạy xong.
- `Kho lưu trữ` chứa bài failed/cần review, không có retry count hoặc lịch sử retry gần nhất.
- `Thùng rác` chứa bài đã hủy/xóa, không có cột lý do.
- Settings dùng layout tab/menu trái và form cấu hình phải.
- Mock API có dữ liệu mẫu đủ để demo toàn bộ web mà không cần backend thật.
- Có kiểm tra giữ tiếng Việt có dấu chuẩn UTF-8 cho các page/admin copy quan trọng.
