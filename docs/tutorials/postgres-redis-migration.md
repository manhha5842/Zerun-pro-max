# Tutorial — Migrate Postgres + Redis/BullMQ (M4)

> Chỉ làm khi tải đã lớn / cần nhiều worker. Trước đó SQLite + local queue là đủ.
> Repo đã có `docker-compose.yml`.

## Phần A — SQLite → PostgreSQL

### 1. Đổi datasource (Prisma)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")   // postgresql://user:pass@localhost:5432/zerun
}
```
### 2. Lưu ý khác biệt
- Kiểu `Json` SQLite vốn lưu text → Postgres dùng `jsonb` (Prisma map tự động). Kiểm tra field `Json`.
- `String` không giới hạn ok cả hai. `DateTime` ok.
- Tạo migration mới cho Postgres: `prisma migrate dev` trên DB Postgres rỗng.
### 3. Chuyển dữ liệu
- Nếu cần giữ data SQLite: export theo bảng → import. Hoặc viết script `tsx` đọc Prisma(SQLite
  client) ghi sang Prisma(Postgres client). Thứ tự theo FK (AdminUser → SourceAccount → ... → Content → con).
- Đa số trường hợp local: bắt đầu Postgres sạch + re-login account là nhanh nhất.

## Phần B — Local queue → Redis/BullMQ

### 1. Hiện trạng
Worker dùng local queue (`packages/worker-core/src/runtime.ts`, `QueueName`/`JobName` trong `types.ts`).
Giữ nguyên tên queue/job để đổi backend ít đụng processor.

### 2. Thêm BullMQ
```
npm i bullmq ioredis -w @zerun/worker-core
```
- Mỗi `QueueName` → 1 BullMQ `Queue` + `Worker`. Processor hiện tại (`processContent`, `publish`,...)
  bọc vào `new Worker(name, async job => processor(job.data, ctx))`.
- `enqueueX` đổi từ local sang `queue.add(jobName, payload, { attempts, backoff })`.
- Retry/backoff: dùng BullMQ options thay vì tự code.

### 3. docker-compose
Bật service `postgres` + `redis` trong `docker-compose.yml` (đã có khung). API + worker đọc
`DATABASE_URL` + `REDIS_URL` từ env.

### 4. Tách process
M4 có thể tách API và worker thành 2 process/container riêng (cùng DB+Redis) để scale worker.

## Done checklist
- [ ] datasource Postgres + migration chạy sạch
- [ ] field Json hoạt động trên jsonb
- [ ] (nếu cần) script chuyển data theo thứ tự FK
- [ ] BullMQ Queue/Worker cho từng QueueName, giữ tên job
- [ ] retry/backoff qua BullMQ options
- [ ] compose up postgres+redis, API+worker đọc env
