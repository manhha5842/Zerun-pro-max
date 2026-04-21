# Implementation Rules

Áp dụng cho toàn bộ repo `Zerun-pro-max`.

## 1. Không implement theo suy đoán khi đụng tới UI automation của nền tảng

Với các chức năng browser automation như:
- tạo bài đăng feed
- đăng story
- đăng reel/video
- đăng bài Threads
- upload media
- các bước Next / Share / Post / Publish

**không được tự ý implement chỉ dựa trên suy đoán**.

Phải có ít nhất một trong các nguồn sau trước khi merge:
1. Nguồn chính thức / docs chính thức của nền tảng
2. Mã nguồn công khai trên GitHub có flow gần tương đương
3. Bằng chứng runtime nội bộ:
   - screenshot
   - video quay flow
   - log selector thực tế
   - HAR / DOM snapshot / error snapshot

Nếu chưa có nguồn đủ mạnh, code phải được đánh dấu rõ là:
- `hypothesis`
- `needs_runtime_validation`
- hoặc `experimental`

## 2. Mỗi tính năng publish phải ghi nguồn kèm theo

Mỗi lần implement hoặc sửa flow cho platform automation, phải cập nhật file:
- `docs/automation-change-log.md`

Mỗi entry phải có:
- ngày
- platform
- tính năng
- file code đã sửa
- tóm tắt thay đổi
- nguồn tham chiếu cụ thể (URL hoặc đường dẫn nội bộ)
- mức độ tin cậy:
  - `official`
  - `github-reference`
  - `runtime-verified`
  - `hypothesis`

## 3. Nếu nguồn chỉ là GitHub tham khảo

Phải ghi rõ:
- repo nào
- file nào
- link cụ thể
- dùng để tham khảo phần nào

Không được viết kiểu mơ hồ như "research từ GitHub".

## 4. Nếu route/selector là suy luận

Phải ghi rõ trong changelog rằng:
- selector/URL là suy luận từ pattern hiện tại
- chưa được runtime-verified

Ví dụ:
- direct route như `/stories/create/`
- selector `aria-label`
- button text fallback nhiều ngôn ngữ

## 5. Ưu tiên mức độ bằng chứng

Thứ tự ưu tiên:
1. runtime-verified trên chính tài khoản chạy thật
2. official docs / official help pages
3. GitHub code references có logic gần giống
4. hypothesis

## 6. Khi trả lời user về một flow automation

Phải nói rõ flow đó đang ở mức nào:
- đã test thật
- đã có nguồn GitHub nhưng chưa test thật
- đang là giả thuyết

## 7. Không được dùng token lộ trong chat như bí mật an toàn

Nếu token/API key được dán trong chat, mặc định xem là **đã lộ**.
Có thể dùng tạm nếu user yêu cầu trực tiếp, nhưng phải nhắc user revoke/replace sau đó.
