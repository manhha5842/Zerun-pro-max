# Tutorial — Deploy 24/7 + Cloudflare Access (M4)

> Chạy nền 24/7 trên máy cá nhân + điều khiển từ xa an toàn. Repo có `cloudflared.example.yml`.
> ⚠️ KHÔNG expose dashboard ra Internet khi chưa làm xong [mã hoá credentials](credentials-encryption.md).

## Phần A — Chạy nền 24/7 (Windows)

### Build production
```
npm run build            # typecheck + build web admin static
```
API serve static web + chạy worker.

### NSSM (khuyến nghị trên Windows)
```
Service name: Zerun
Path: C:\Program Files\nodejs\npm.cmd
Arguments: run start:api
Startup dir: C:\Users\manhh\Projects\Zerun-pro-max
```
Hoặc **PM2**:
```
npm i -g pm2
pm2 start npm --name zerun -- run start:api
pm2 save && pm2 startup
```

### Vận hành
- Backup SQLite hằng ngày (copy file `.db` + WAL) → `storage/backups/` (giữ N bản).
- Log rotation cho `logs/` (giới hạn dung lượng, xóa cũ).
- Health monitor: cron nội bộ ping `/health`, account health → tự pause khi lỗi (đã có `platform-health`).

## Phần B — Cloudflare Tunnel + Access

### 1. Tunnel
```
cloudflared tunnel login
cloudflared tunnel create zerun
# config.yml: route hostname → http://localhost:3000
cloudflared tunnel run zerun
```
Cài cloudflared như **service** để tự chạy cùng máy. Tham khảo `cloudflared.example.yml`.

### 2. Access (BẮT BUỘC — đừng public trần)
- Tạo **Self-hosted application** cho `https://zerun.<domain>`.
- Policy: **Allow** chỉ email của bạn (`manhha584224@gmail.com`).
- Bật **MFA** (one-time PIN / Google).
- Toàn bộ request phải qua Access → không ai có link mà vào được nếu không thuộc allowlist.

### 3. Bảo mật bổ sung
- Không expose `/storage/sessions`, `/storage/cookies`, `/screenshots`, Prisma Studio.
- Dashboard vẫn có auth riêng (JWT + session timeout — đã có `AdminUser`/`RefreshToken`).
- Audit log: ai approve/sửa/đăng gì (mở rộng `ActivityLog`).

## Done checklist
- [ ] NSSM/PM2 service tự chạy khi bật máy
- [ ] backup SQLite hằng ngày + log rotation
- [ ] cloudflared chạy như service, route localhost:3000
- [ ] Cloudflare Access allow chỉ email của bạn + MFA
- [ ] không expose storage/screenshots/Prisma Studio
- [ ] đã làm xong mã hoá credentials TRƯỚC khi bật remote
