# Checklist thiết lập đăng lại

> Cập nhật kỹ thuật: 15/06/2026  
> Đây là nguồn sự thật duy nhất cho trạng thái setup. Không đánh dấu hoàn tất chỉ vì form đã lưu.

## Quy ước trạng thái

- `[x] Code`: đã có implementation và qua typecheck/test/build.
- `[x] UI`: UI lưu đúng field mà runtime sử dụng.
- `[x] Test nội bộ`: đã kiểm tra bằng test tự động hoặc API local.
- `[ ] Test tài khoản thật`: vẫn cần credential/tài khoản thật của người vận hành.
- `BLOCKED`: không được hiển thị như chức năng sẵn sàng.

Một tích hợp chỉ được coi là **sẵn sàng vận hành** khi cả Code, UI, Test nội bộ và Test tài khoản thật đều hoàn tất.

## Ma trận nền tảng

| Nền tảng | Mục đích trong phase này | Code | UI | Test tài khoản thật | Quyết định |
|---|---|---:|---:|---:|---|
| Telegram MTProto | Đọc channel/group và đăng tới channel/group | Có | Có | Chưa | Cho phép cấu hình |
| Zalo cá nhân | Nghe nhóm realtime và gửi vào nhóm | Có | Có QR cho nguồn/đích | Chưa | Cho phép cấu hình, chỉ dùng tài khoản phụ |
| Facebook/Instagram/Threads/X | Đăng/crawl social | Có code cũ từng phần | Ẩn khỏi luồng đăng lại | Chưa trong phase này | Không test ở checklist này |

## Mô hình cấu hình hiện tại

- Tài khoản chỉ là phiên đăng nhập, không phải nguồn/đích 1:1.
- Một tài khoản nguồn có thể thêm nhiều nhóm/kênh nguồn tại **Tài khoản nguồn → Quản lý kênh nguồn**.
- Một tài khoản đích có thể thêm nhiều nhóm/kênh đích tại **Tài khoản đích → Quản lý kênh đích**.
- Có thể dùng lại tài khoản nguồn làm tài khoản đăng khi thêm kênh đích; app tự tạo target mirror nội bộ.
- Bộ lọc ngành hàng nằm ở từng kênh đích: `Nhận tất cả` hoặc `Chỉ nhận ngành hàng đã chọn`.
- Nội dung tổng quát như mã toàn sàn, Shopee VIP, voucher chung, deal 1k/9k có thể đi qua nếu bật **Vẫn nhận nội dung tổng quát**.
- Luồng đăng lại dùng mô hình N:N: nhiều kênh nguồn → bộ xử lý → nhiều kênh đích.

## Telegram nguồn

### TG-SRC-01 - Lấy API ID và API Hash

- [ ] Mở [my.telegram.org/apps](https://my.telegram.org/apps).
- [ ] Đăng nhập bằng số điện thoại Telegram có mã quốc gia.
- [ ] Mở **API development tools**.
- [ ] Tạo app nếu chưa có.
- [ ] Ghi lại `api_id`: phải là số nguyên dương.
- [ ] Ghi lại `api_hash`: chuỗi bí mật, không phải Bot Token.
- [ ] Không gửi `api_hash` lên chat, ticket hoặc commit Git.

### TG-SRC-02 - Đăng nhập Telegram trong UI

- [x] UI nhập `apiId`, `apiHash`, số điện thoại và gửi OTP.
- [x] App tự tạo/lưu StringSession sau khi OTP/2FA hợp lệ.
- [ ] Vào **Tài khoản nguồn**.
- [ ] Bấm **Kết nối tài khoản**.
- [ ] Chọn Telegram MTProto, nhập `apiId`, `apiHash`, số điện thoại dạng `+84901234567`.
- [ ] Nhập OTP Telegram gửi về.
- [ ] Nhập mật khẩu xác minh hai bước nếu tài khoản đã bật 2FA.
- [ ] Xác nhận tài khoản hiện trong danh sách với Health `healthy`.

**Hoàn tất khi:** tài khoản Telegram đã kết nối, không cần copy StringSession thủ công.

### TG-SRC-03 - Chọn nhiều kênh nguồn

- [ ] Tài khoản tạo StringSession đã tham gia nguồn.
- [ ] Ở **Quản lý kênh nguồn**, chọn tài khoản Telegram.
- [ ] Bấm **Đồng bộ** nếu danh sách chưa hiện.
- [ ] Chọn một hoặc nhiều group/channel cần đọc.
- [ ] Bấm **Thêm kênh nguồn**.

### TG-SRC-04 - Lưu và kiểm tra

- [x] UI lưu `credentials.apiId` dạng số.
- [x] UI lưu `credentials.apiHash`.
- [x] UI lưu `credentials.session`.
- [ ] Lưu tài khoản nguồn.
- [ ] Bấm **Kiểm tra**.
- [ ] Chờ Health chuyển thành `healthy`.
- [ ] Chạy crawl thử và xác nhận nội dung lấy từ đúng nguồn.

## Telegram đích

### TG-DST-01 - Quyền đăng

- [ ] Tài khoản Telegram trong StringSession đã tham gia target.
- [ ] Với channel: tài khoản là admin và có quyền **Post Messages**.
- [ ] Gửi thủ công một tin vào target để xác nhận quyền.

### TG-DST-02 - Chọn nhiều kênh đích

- [x] UI không yêu cầu nhập target thủ công.
- [x] App inject `PlatformChannel.externalId` vào `credentials.target` khi publish.
- [ ] Ở **Tài khoản đích → Quản lý kênh đích**, chọn tài khoản Telegram riêng hoặc dùng lại tài khoản nguồn.
- [ ] Chọn một hoặc nhiều group/channel nhận bài.
- [ ] Cấu hình mỗi kênh đích: nhận tất cả hoặc lọc theo ngành.
- [ ] Bấm **Kiểm tra** và chờ Health `healthy`.
- [ ] Tạo luồng thử với auto-publish tắt.
- [ ] Duyệt một bài và xác nhận bài xuất hiện đúng target.

## Zalo cá nhân nguồn

> `zca-js` là API không chính thức. Chỉ dùng tài khoản phụ và không chạy đồng thời nhiều listener bằng cùng một tài khoản.

### ZALO-SRC-01 - Tạo tài khoản an toàn

- [ ] Tạo nguồn Zalo cá nhân ở trạng thái **Tạm tắt**.
- [ ] Không điền credential bằng tay.
- [ ] Mở **Tài khoản > Session đăng nhập**.

### ZALO-SRC-02 - QR login

- [x] API tạo session cho account kind `source`.
- [x] API tạo QR và lưu `imei`, `userAgent`, `cookie`.
- [ ] Bấm **1. Tạo session**.
- [ ] Bấm **2. QR login**.
- [ ] Trong ứng dụng Zalo điện thoại, dùng chức năng quét QR.
- [ ] Xác nhận đăng nhập trên điện thoại nếu Zalo yêu cầu.
- [ ] Chờ trạng thái **Đã đăng nhập**.

### ZALO-SRC-03 - Chọn nhiều nhóm nguồn

- [x] API đọc danh sách nhóm bằng `getAllGroups` và `getGroupInfo`.
- [x] UI hiển thị tên nhóm, số thành viên và `threadId`.
- [x] UI thêm nhiều nhóm nguồn qua **Quản lý kênh nguồn**.
- [ ] Ở **Tài khoản nguồn → Quản lý kênh nguồn**, chọn tài khoản Zalo.
- [ ] Chọn một hoặc nhiều nhóm cần nghe.
- [ ] Bấm **Thêm kênh nguồn**.
- [ ] Xác nhận tài khoản nguồn có `config.threadIds` tương ứng.
- [ ] Chuyển trạng thái sang **Đang bật** và lưu.

### ZALO-SRC-04 - Kiểm tra listener

- [x] Listener bỏ tin do chính tài khoản gửi.
- [x] Listener chỉ nhận group.
- [x] Listener lọc đúng `config.threadId`/`config.threadIds`.
- [ ] Bấm **Kiểm tra**, Health phải là `healthy`.
- [ ] Gửi một tin tiếng Việt có dấu vào nhóm đã chọn.
- [ ] Xác nhận hệ thống tạo đúng một content.
- [ ] Gửi tin vào nhóm Zalo khác.
- [ ] Xác nhận hệ thống không tạo content từ nhóm khác.

## Zalo cá nhân đích

### ZALO-DST-01 - QR login

- [x] API tạo session cho account kind `target`.
- [x] QR login cập nhật credential vào `TargetAccount`.
- [ ] Tạo đích Zalo cá nhân ở trạng thái **Tạm tắt**.
- [ ] Mở Session đăng nhập và quét QR tại khu vực **tài khoản đích**.
- [ ] Chờ trạng thái **Đã đăng nhập**.

### ZALO-DST-02 - Chọn nhiều nhóm đích và gửi thử

- [x] UI thêm nhiều nhóm đích qua **Quản lý kênh đích**.
- [x] App inject `PlatformChannel.externalId` vào `config.threadId` khi publish.
- [ ] Ở **Tài khoản đích → Quản lý kênh đích**, chọn tài khoản Zalo riêng hoặc dùng lại tài khoản nguồn.
- [ ] Chọn đúng nhóm nhận bài.
- [ ] Chọn ngành hàng cho từng kênh đích nếu cần lọc.
- [ ] Bật tài khoản và bấm **Kiểm tra**.
- [ ] Health phải là `healthy`.
- [ ] Auto-publish vẫn tắt.
- [ ] Duyệt một bài tiếng Việt có dấu.
- [ ] Xác nhận bài chỉ xuất hiện một lần trong đúng nhóm.

## AI

### AI-01 - Credential

- [ ] Tạo API key tại dashboard provider OpenAI-compatible.
- [ ] Có Base URL API, không dùng URL trang dashboard.
- [ ] Có model hợp lệ hoặc dùng `auto` nếu gateway hỗ trợ.

### AI-02 - Kết nối runtime

- [x] UI test trực tiếp Base URL/API key/model.
- [x] UI lưu vào `AiConfig` mà worker thực sự đọc.
- [x] Cache AI được invalidate sau khi lưu.
- [ ] Bấm **Test kết nối** và thấy model + latency.
- [ ] Bấm **Lưu AI**.
- [ ] Đưa một content `Mẹ & Bé` qua xử lý.
- [ ] Metadata có `primaryCategory`, `secondaryCategories`, `categoryConfidence`, `categoryReason`.

## Affiliate

### AFF-01 - AccessTrade

- [ ] Tài khoản publisher AccessTrade đã được duyệt.
- [ ] Có API key cho Product Link API.
- [ ] Có Campaign ID của chiến dịch đã được duyệt.
- [x] UI lưu `accessTradeToken` và `accessTradeCampaignId`.
- [x] Worker đọc cấu hình Affiliate từ database khi khởi động.
- [ ] Lưu cấu hình rồi khởi động lại `npm run dev`.
- [ ] Convert thử một URL Shopee thật tại **Công cụ > Convert link nhanh**.
- [ ] Xác nhận nhận được tracking link.

### AFF-02 - Lazada

- [x] Có adapter ký request Lazada Open API.
- [x] UI có App Key, App Secret, Access Token và Region.
- [ ] App Lazada đã được duyệt.
- [ ] Access Token còn hạn.
- [ ] Test một link Lazada thật.
- [ ] Nếu tài khoản thật chưa được duyệt, giữ trạng thái `BLOCKED` và dùng xử lý thủ công.

## Cảnh báo Telegram

### ALERT-01 - Tạo bot và lấy Chat ID

- [ ] Mở [@BotFather](https://t.me/BotFather).
- [ ] Gửi `/newbot`.
- [ ] Lưu Bot Token dạng `123456:ABC...`.
- [ ] Chat riêng: bấm Start và gửi một tin cho bot.
- [ ] Group: thêm bot rồi gửi một tin có nhắc bot.
- [ ] Mở `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`.
- [ ] Lấy `result[].message.chat.id`.
- [ ] Chat riêng thường là số dương; group thường là số âm hoặc bắt đầu `-100`.

### ALERT-02 - Test

- [x] API có endpoint gửi tin thử.
- [ ] Nhập Bot Token và Chat ID.
- [ ] Bấm **Gửi thử**.
- [ ] Nhận được tin “Zerun đã kết nối cảnh báo Telegram thành công.”
- [ ] Bật trạng thái và lưu.

## Luồng đăng lại và routing theo ngành

- [x] UI tạo `RepostFlow` theo `sourceChannelIds` và `targetChannelIds`.
- [x] Worker ưu tiên `RepostFlow + PlatformChannel` khi Content có `sourceChannelId`.
- [ ] Tạo kênh nguồn `Mẹ & Bé`.
- [ ] Tạo kênh đích A nhận `Mẹ & Bé`.
- [ ] Tạo kênh đích B nhận `Điện Thoại & Phụ Kiện`.
- [ ] Tạo luồng từ kênh nguồn tới cả A và B.
- [ ] Content `Mẹ & Bé` chỉ match A.
- [ ] Content nhiều ngành match mọi target có ít nhất một ngành trùng.
- [ ] Một target chỉ xuất hiện một lần dù match nhiều ngành.
- [ ] Content tổng quát như mã toàn sàn vẫn match target lọc ngành nếu target bật **Vẫn nhận nội dung tổng quát**.
- [ ] `categoryConfidence < 0.75` vào Hàng chờ duyệt.
- [ ] Không có target phù hợp thì lý do là `Không có đích phù hợp ngành hàng`.
- [ ] Tiếng Việt có dấu không bị lỗi ở caption, category, hướng dẫn và validation.

## Lệnh chạy và kiểm tra kỹ thuật

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/health`
- Không chạy riêng `npm run dev:web` trừ khi đang debug UI; lệnh đó không khởi động API.
- Nếu port 3000 bận, dừng tiến trình cũ trước khi chạy lại. Không đổi Vite sang port ngẫu nhiên vì UI và proxy đã cố định.

## Điều kiện hoàn tất phase setup

- [ ] Telegram nguồn và đích đều qua test tài khoản thật.
- [ ] Zalo nguồn và đích đều qua QR, chọn nhóm và test đúng threadId.
- [ ] AI trả category đúng schema.
- [ ] Affiliate convert được ít nhất một link thật hoặc được đánh dấu rõ `BLOCKED`.
- [ ] Telegram alert gửi thử thành công.
- [ ] Routing ngành qua toàn bộ test ở trên.
- [ ] Auto-publish chỉ được bật sau khi tất cả mục bắt buộc hoàn tất.
