# Milestone 4 — Scale & vận hành 24/7 từ xa

**Mục tiêu:** chạy nền 24/7, điều khiển từ xa an toàn, tối ưu chi phí AI, có backup & audit.
**Tiền đề:** M2 (bảo mật) bắt buộc xong trước khi expose. M3 nên xong. **Exit:** máy bật là hệ thống tự chạy, điều khiển qua web từ xa.

## Quy tắc thực thi
Tick `[x]` ngay khi xong; chỉ tick khi thỏa `Done khi:`. 📘 = đọc tutorial trước. typecheck xanh.

---

## Nhóm A — Hạ tầng (chỉ làm khi tải đã lớn)  📘 [postgres-redis-migration.md](tutorials/postgres-redis-migration.md)
- [ ] **A1** SQLite → PostgreSQL (datasource + migration + kiểm field Json/jsonb).
  `Done khi:` app chạy trên Postgres, dữ liệu đọc/ghi đúng.
- [ ] **A2** Local queue → Redis/BullMQ (Queue/Worker theo từng `QueueName`, giữ tên job; retry/backoff qua options).
  `Done khi:` job chạy qua BullMQ, retry hoạt động, không đổi processor logic.
- [ ] **A3** docker-compose bật postgres+redis; API+worker đọc `DATABASE_URL`/`REDIS_URL`.
  `Done khi:` `docker compose up` lên đủ service, app kết nối được.
- [ ] **A4** (optional) Tách API và worker thành 2 process/container để scale worker.
  `Done khi:` chạy nhiều worker cùng lúc không trùng job.

## Nhóm B — Chạy nền 24/7  📘 [cloudflare-access-deploy.md](tutorials/cloudflare-access-deploy.md#phần-a--chạy-nền-247-windows)
- [ ] **B1** Production build + NSSM/PM2 service tự chạy khi bật máy.
  `Done khi:` reboot máy → Zerun tự lên, dashboard truy cập localhost được.
- [ ] **B2** Backup SQLite/Postgres hằng ngày → `storage/backups/` (giữ N bản) + restore thử.
  `Done khi:` có bản backup tự tạo mỗi ngày; restore thử thành công.
- [ ] **B3** Log rotation cho `logs/` (giới hạn dung lượng, xóa cũ).
  `Done khi:` log không phình vô hạn.
- [ ] **B4** Health monitor nội bộ ping `/health` + account health → cảnh báo khi service chết.
  `Done khi:` kill service → nhận cảnh báo.

## Nhóm C — Remote control  📘 [cloudflare-access-deploy.md](tutorials/cloudflare-access-deploy.md#phần-b--cloudflare-tunnel--access)
- [ ] **C1** Cloudflared chạy như service, route hostname → localhost:3000.
  `Done khi:` truy cập `https://zerun.<domain>` ra dashboard.
- [ ] **C2** Cloudflare Access self-hosted app: allow chỉ email của bạn + MFA.
  `Done khi:` email khác bị chặn ở tầng Access; email bạn vào được sau MFA.
- [ ] **C3** Không expose storage/sessions, screenshots, Prisma Studio; dashboard vẫn có auth riêng + session timeout.
  `Done khi:` thử truy cập path nhạy cảm → bị chặn.

## Nhóm D — Tối ưu AI
- [ ] **D1** Prompt caching: đảm bảo static prompt cố định byte-for-byte giữa các call.
  `Done khi:` provider báo cache hit (hoặc token prompt giảm) cho call lặp.
- [ ] **D2** Provider fallback + chọn theo chi phí (rẻ trước, fallback khi lỗi).
  `Done khi:` provider chính lỗi → tự chuyển provider phụ.
- [ ] **D3** Eval harness đo độ chính xác classify trên tập tin đã duyệt.
  `Done khi:` chạy eval ra số accuracy theo provider/model.
- [ ] **D4** (optional) Fine-tuning khi đã đủ data duyệt đúng/sai.
  `Done khi:` model fine-tune cải thiện accuracy so với baseline.

## Nhóm E — Quản trị
- [ ] **E1** Audit log: ai approve/sửa caption/đăng target nào/lỗi gì (mở rộng `ActivityLog`).
  `Done khi:` mỗi hành động duyệt/sửa/đăng có 1 bản ghi truy vết được.
- [ ] **E2** (optional) RBAC nếu nhiều người dùng.
  `Done khi:` phân quyền theo role hoạt động.

---
**Thứ tự:** B (chạy nền) → C (remote, sau khi M2 bảo mật xong) → E (audit) → D (tối ưu AI) → A (hạ tầng, chỉ khi tải lớn).
