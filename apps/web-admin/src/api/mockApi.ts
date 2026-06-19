type AnyRecord = Record<string, any>;

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

const sourceAccounts: AnyRecord[] = [
  { id: "src-fb-deal", kind: "source", platform: "facebook", name: "Group săn deal mẹ và bé", handle: "deal-me-be", isActive: true, health: "healthy", credentials: {}, config: { crawlComments: true }, createdAt: hoursAgo(240), updatedAt: hoursAgo(2) },
  { id: "src-telegram-shop", kind: "source", platform: "telegram", name: "Telegram Deal Hot", handle: "@dealhot", isActive: true, health: "healthy", credentials: {}, config: { realtime: true }, createdAt: hoursAgo(200), updatedAt: hoursAgo(1) },
  { id: "src-web-blog", kind: "source", platform: "web", name: "Blog review sản phẩm", handle: "review.example.vn", isActive: false, health: "paused", credentials: {}, config: {}, createdAt: hoursAgo(300), updatedAt: hoursAgo(48) }
];

const targetAccounts: AnyRecord[] = [
  { id: "acc-fb-main", kind: "target", platform: "facebook", name: "Facebook Page Zerun Deals", handle: "zerun.deals", isActive: true, health: "healthy", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(1), authPath: "sessions/facebook/zerun-deals/auth.json" }, createdAt: hoursAgo(500), updatedAt: hoursAgo(1) },
  { id: "acc-ig-shop", kind: "target", platform: "instagram", name: "Instagram Shop Review", handle: "@shop.review", isActive: true, health: "checkpoint", credentials: {}, config: {}, sessionState: { authState: "checkpoint", lastCheckedAt: hoursAgo(5), authPath: "sessions/instagram/shop-review/auth.json" }, createdAt: hoursAgo(420), updatedAt: hoursAgo(5) },
  { id: "acc-thread-daily", kind: "target", platform: "threads", name: "Threads Daily Finds", handle: "@daily.finds", isActive: true, health: "healthy", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(3), authPath: "sessions/threads/daily-finds/auth.json" }, createdAt: hoursAgo(390), updatedAt: hoursAgo(3) },
  { id: "acc-x-main", kind: "target", platform: "x", name: "X Deal Updates", handle: "@zerun_deals", isActive: true, health: "healthy", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(2), authPath: "sessions/x/zerun-deals/auth.json" }, createdAt: hoursAgo(380), updatedAt: hoursAgo(2) }
];

sourceAccounts.push(
  { id: "src-fb-home", kind: "source", platform: "facebook", name: "Page review nhà cửa", handle: "review-nha-cua", isActive: true, health: "healthy", credentials: {}, config: { crawlComments: false }, createdAt: hoursAgo(260), updatedAt: hoursAgo(4) },
  { id: "src-lazada-blog", kind: "source", platform: "web", name: "Blog deal Lazada", handle: "lazada-deal.example.vn", isActive: true, health: "healthy", credentials: {}, config: { crawlImages: true }, createdAt: hoursAgo(160), updatedAt: hoursAgo(8) },
  { id: "src-tiktok-note", kind: "source", platform: "web", name: "Nguồn video ngắn", handle: "short-video.example.vn", isActive: false, health: "degraded", credentials: {}, config: { videoOnly: true }, createdAt: hoursAgo(320), updatedAt: hoursAgo(36) }
);

targetAccounts.push(
  { id: "acc-fb-backup", kind: "target", platform: "facebook", name: "Facebook Page Backup Deals", handle: "zerun.backup", isActive: true, health: "degraded", credentials: {}, config: {}, sessionState: { authState: "login_required", lastCheckedAt: hoursAgo(12), authPath: "sessions/facebook/backup/auth.json" }, createdAt: hoursAgo(360), updatedAt: hoursAgo(12) },
  { id: "acc-ig-outlet", kind: "target", platform: "instagram", name: "Instagram Outlet Finds", handle: "@outlet.finds", isActive: true, health: "healthy", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(2), authPath: "sessions/instagram/outlet/auth.json" }, createdAt: hoursAgo(330), updatedAt: hoursAgo(2) },
  { id: "acc-thread-vn", kind: "target", platform: "threads", name: "Threads Deal Việt", handle: "@deal.viet", isActive: false, health: "paused", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(24), authPath: "sessions/threads/deal-viet/auth.json" }, createdAt: hoursAgo(270), updatedAt: hoursAgo(24) },
  { id: "acc-fb-mom", kind: "target", platform: "facebook", name: "Facebook Page Mẹ Và Bé", handle: "mevabe.deals", isActive: true, health: "healthy", credentials: {}, config: {}, sessionState: { authState: "authenticated", lastCheckedAt: hoursAgo(0.5), authPath: "sessions/facebook/mevabe/auth.json" }, createdAt: hoursAgo(210), updatedAt: hoursAgo(0.5) }
);

let browserSessions: AnyRecord[] = [];
let shopeeBrowserSession: AnyRecord = {
  browserName: "Zerun Controlled Browser - Shopee Main",
  accountId: "shopee-main",
  status: "not_started",
  currentUrl: null,
  lastHealthCheckAt: null,
  lastError: null,
  lastScreenshotPath: null,
  queueStatus: { runningJobId: null, queuedJobIds: [], queuedCount: 0, paused: false },
  profilePath: "runtime/browser-profiles/shopee-main",
  browserPid: null,
  pageName: "Shopee Affiliate Converter Page",
  captchaLoginState: null
};
let shopeeBrowserJobs: AnyRecord[] = [];

let contents: AnyRecord[] = [
  {
    id: "content-001",
    code: "AUTO-0001",
    platform: "facebook",
    sourceId: "src-fb-deal",
    source: { name: "Group săn deal mẹ và bé" },
    sourceUrl: "https://facebook.com/groups/deal-me-be/posts/1001",
    author: "Shop Mẹ Bống",
    originalText: "Máy hút sữa đang giảm mạnh hôm nay, freeship toàn quốc. Link Shopee đã được convert.",
    draftText: "Máy hút sữa đang giảm mạnh hôm nay, freeship toàn quốc. Link mua đã sẵn sàng.",
    finalText: "Máy hút sữa đang giảm mạnh hôm nay, freeship toàn quốc. Link mua đã sẵn sàng.",
    status: "scheduled",
    scheduledAt: hoursFromNow(4),
    scheduledTargets: ["acc-fb-main", "acc-thread-daily"],
    metadata: { type: "feed", mediaPaths: ["mock/media/may-hut-sua.jpg"], comment: "Mã giảm thêm ở comment đầu tiên." },
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(1),
    links: [{ id: "link-001", originalUrl: "https://shopee.vn/may-hut-sua", convertedUrl: "https://s.shopee.vn/mock-aff", network: "shopee", status: "converted" }],
    media: [{ id: "media-001", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/may-hut-sua/640/480", localPath: "mock/media/may-hut-sua.jpg" }],
    publishAttempts: [{ id: "attempt-001", targetId: "acc-fb-main", target: targetAccounts[0], status: "scheduled", createdAt: hoursAgo(1) }],
    commentQueues: [{ id: "comment-001", contentId: "content-001", targetId: "acc-fb-main", target: targetAccounts[0], commentText: "Mã giảm thêm ở comment đầu tiên.", commentMedia: [{ id: "comment-media-001", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-voucher-001/420/320" }], scheduledAt: hoursFromNow(4.2), status: "pending", error: null, createdAt: hoursAgo(1), updatedAt: hoursAgo(1) }]
  },
  {
    id: "content-002",
    code: "AUTO-SAVED-0002",
    platform: "telegram",
    sourceId: "src-telegram-shop",
    source: { name: "Telegram Deal Hot" },
    sourceUrl: "https://t.me/dealhot/2288",
    author: "Deal Hot Bot",
    originalText: "Deal nồi chiên không dầu có link Google Form đăng ký bảo hành: https://forms.gle/mock-form",
    draftText: "Deal nồi chiên không dầu cần admin kiểm tra link đăng ký bảo hành.",
    status: "saved",
    scheduledAt: null,
    scheduledTargets: ["acc-fb-main"],
    savedReason: "Có link Google Form chưa hỗ trợ convert tự động",
    savedSource: "auto_conversion",
    lastError: "Link chưa hỗ trợ convert",
    retryCount: 1,
    metadata: { type: "feed", mediaPaths: ["mock/media/noi-chien.jpg"] },
    createdAt: hoursAgo(9),
    updatedAt: hoursAgo(2),
    links: [{ id: "link-002", originalUrl: "https://forms.gle/mock-form", convertedUrl: null, network: "google", status: "saved_for_review" }],
    media: [{ id: "media-002", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/noi-chien/640/480", localPath: "mock/media/noi-chien.jpg" }],
    publishAttempts: [],
    commentQueues: []
  },
  {
    id: "content-003",
    code: "MAN-0003",
    platform: "instagram",
    source: null,
    originalText: "Bài thủ công giới thiệu bộ skincare mới, có 3 ảnh sản phẩm và comment đầu tiên.",
    draftText: "Bài thủ công giới thiệu bộ skincare mới, có 3 ảnh sản phẩm và comment đầu tiên.",
    status: "ready_to_publish",
    scheduledAt: null,
    scheduledTargets: ["acc-ig-shop"],
    metadata: { type: "feed", mediaPaths: ["mock/media/skincare-1.jpg", "mock/media/skincare-2.jpg"], comment: "Inbox để nhận bảng giá ưu đãi." },
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(1.5),
    links: [],
    media: [{ id: "media-003", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/skincare/640/480", localPath: "mock/media/skincare-1.jpg" }],
    publishAttempts: [{ id: "attempt-003", targetId: "acc-ig-shop", target: targetAccounts[1], status: "pending", createdAt: hoursAgo(1.5) }],
    commentQueues: [{ id: "comment-002", contentId: "content-003", targetId: "acc-ig-shop", target: targetAccounts[1], commentText: "Inbox để nhận bảng giá ưu đãi.", commentMedia: [], scheduledAt: hoursAgo(2), status: "failed", error: "Instagram account checkpoint", createdAt: hoursAgo(6), updatedAt: hoursAgo(2) }]
  },
  {
    id: "content-004",
    code: "TRASH-0004",
    platform: "facebook",
    source: { name: "Group săn deal mẹ và bé" },
    originalText: "Bài test cũ đã hủy vì trùng nội dung với bài đã đăng tuần trước.",
    status: "trashed",
    scheduledAt: null,
    scheduledTargets: ["acc-fb-main"],
    cancelReason: "Trùng nội dung",
    deletedAt: hoursAgo(18),
    metadata: { type: "feed" },
    createdAt: hoursAgo(60),
    updatedAt: hoursAgo(18),
    links: [],
    media: [],
    publishAttempts: [],
    commentQueues: []
  },
  {
    id: "content-005",
    code: "PUB-0005",
    platform: "threads",
    source: null,
    originalText: "Tổng hợp 5 món đồ gia dụng đáng mua trong tuần, nội dung đã đăng thành công.",
    status: "published",
    postedAt: hoursAgo(3),
    scheduledAt: hoursAgo(4),
    scheduledTargets: ["acc-thread-daily"],
    metadata: { type: "feed" },
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(3),
    links: [],
    media: [],
    publishAttempts: [{ id: "attempt-005", targetId: "acc-thread-daily", target: targetAccounts[2], status: "published", resultUrl: "https://threads.net/@daily.finds/post/mock", createdAt: hoursAgo(3) }],
    commentQueues: []
  },
  {
    id: "content-006",
    code: "FAIL-0006",
    platform: "facebook",
    source: { name: "Auto conversion Facebook" },
    originalText: "Bài đăng tự động bị lỗi vì tài khoản Facebook cần xác minh checkpoint.",
    draftText: "Bài đăng tự động bị lỗi vì tài khoản Facebook cần xác minh checkpoint.",
    status: "failed",
    scheduledAt: hoursAgo(1),
    scheduledTargets: ["acc-fb-main"],
    savedReason: "Tài khoản đăng cần xác minh checkpoint",
    savedSource: "publish_worker",
    lastError: "Facebook checkpoint required",
    metadata: { type: "feed", mediaPaths: [], comment: "Comment vẫn được giữ cùng bài viết." },
    createdAt: hoursAgo(8),
    updatedAt: hoursAgo(0.5),
    links: [],
    media: [],
    publishAttempts: [{ id: "attempt-006", targetId: "acc-fb-main", target: targetAccounts[0], status: "failed", error: "Facebook checkpoint required", createdAt: hoursAgo(0.5) }],
    commentQueues: [{ id: "comment-006", contentId: "content-006", targetId: "acc-fb-main", target: targetAccounts[0], commentText: "Comment vẫn được giữ cùng bài viết.", commentMedia: [], scheduledAt: hoursAgo(1), status: "blocked", error: "Bài đăng chính chưa thành công.", createdAt: hoursAgo(8), updatedAt: hoursAgo(0.5) }]
  }
];

contents.push(
  {
    id: "content-007",
    code: "AUTO-0007",
    platform: "instagram",
    source: { name: "Page review nhà cửa" },
    sourceUrl: "https://facebook.com/review-nha-cua/posts/7007",
    author: "Nhà Đẹp Review",
    originalText: "Set kệ bếp mini đang giảm giá, ảnh thật đủ góc, phù hợp căn hộ nhỏ.",
    draftText: "Set kệ bếp mini đang giảm giá, ảnh thật đủ góc, phù hợp căn hộ nhỏ.",
    status: "scheduled",
    scheduledAt: hoursFromNow(1.5),
    scheduledTargets: ["acc-ig-outlet"],
    metadata: { type: "reel", mediaPaths: ["mock/media/ke-bep-1.jpg", "mock/media/ke-bep-2.jpg"], comment: "Link ưu đãi ở comment đầu tiên." },
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(0.7),
    links: [{ id: "link-007", originalUrl: "https://lazada.vn/ke-bep-mini", convertedUrl: "https://c.lazada.vn/mock-ke-bep", network: "lazada", status: "converted" }],
    media: [
      { id: "media-007-a", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/ke-bep-1/640/480", localPath: "mock/media/ke-bep-1.jpg" },
      { id: "media-007-b", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/ke-bep-2/640/480", localPath: "mock/media/ke-bep-2.jpg" },
      { id: "media-007-c", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/ke-bep-3/640/480", localPath: "mock/media/ke-bep-3.jpg" }
    ],
    publishAttempts: [{ id: "attempt-007", targetId: "acc-ig-outlet", target: targetAccounts[4], status: "scheduled", createdAt: hoursAgo(0.7) }],
    commentQueues: [{ id: "comment-007", contentId: "content-007", targetId: "acc-ig-outlet", target: targetAccounts[4], commentText: "Link ưu đãi ở comment đầu tiên.", commentMedia: [{ id: "comment-media-007", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-ke-bep/420/320" }], scheduledAt: hoursFromNow(1.7), status: "pending", error: null, createdAt: hoursAgo(0.7), updatedAt: hoursAgo(0.7) }]
  },
  {
    id: "content-008",
    code: "AUTO-0008",
    platform: "facebook",
    source: { name: "Group săn deal mẹ và bé" },
    originalText: "Bỉm quần size M có deal tốt trong khung giờ tối, nội dung đã rewrite nhẹ cho tự nhiên.",
    draftText: "Bỉm quần size M có deal tốt trong khung giờ tối, nội dung đã rewrite nhẹ cho tự nhiên.",
    status: "scheduled",
    scheduledAt: hoursFromNow(8),
    scheduledTargets: ["acc-fb-mom", "acc-fb-main"],
    metadata: { type: "feed", mediaPaths: ["mock/media/bim-size-m.jpg"], comment: "Mã giảm thêm áp dụng đến 23:59.", commentMedia: [{ id: "comment-media-008-meta", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-bim/420/320" }] },
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(0.8),
    links: [{ id: "link-008", originalUrl: "https://shopee.vn/bim-size-m", convertedUrl: "https://s.shopee.vn/mock-bim", network: "shopee", status: "converted" }],
    media: [{ id: "media-008", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/bim-size-m/640/480", localPath: "mock/media/bim-size-m.jpg" }],
    publishAttempts: [
      { id: "attempt-008-a", targetId: "acc-fb-mom", target: targetAccounts[6], status: "scheduled", createdAt: hoursAgo(0.8) },
      { id: "attempt-008-b", targetId: "acc-fb-main", target: targetAccounts[0], status: "scheduled", createdAt: hoursAgo(0.8) }
    ],
    commentQueues: [{ id: "comment-008", contentId: "content-008", targetId: "acc-fb-mom", target: targetAccounts[6], commentText: "Mã giảm thêm áp dụng đến 23:59.", commentMedia: [{ id: "comment-media-008", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-bim/420/320" }], scheduledAt: hoursFromNow(8.1), status: "pending", error: null, createdAt: hoursAgo(0.8), updatedAt: hoursAgo(0.8) }]
  },
  {
    id: "content-009",
    code: "MAN-0009",
    platform: "threads",
    source: null,
    originalText: "Danh sách 7 món đồ làm việc tại nhà đáng mua, chuẩn bị đăng Threads sau khi duyệt caption.",
    draftText: "Danh sách 7 món đồ làm việc tại nhà đáng mua, chuẩn bị đăng Threads sau khi duyệt caption.",
    status: "paused",
    scheduledAt: hoursFromNow(12),
    scheduledTargets: ["acc-thread-daily"],
    metadata: { type: "feed", mediaPaths: [], comment: "" },
    createdAt: hoursAgo(18),
    updatedAt: hoursAgo(6),
    links: [],
    media: [],
    publishAttempts: [{ id: "attempt-009", targetId: "acc-thread-daily", target: targetAccounts[2], status: "paused", createdAt: hoursAgo(6) }],
    commentQueues: []
  },
  {
    id: "content-010",
    code: "DRAFT-0010",
    platform: "facebook",
    source: null,
    originalText: "Bài nháp về máy lọc không khí mini, admin cần kiểm tra lại ảnh và câu CTA trước khi lên lịch.",
    draftText: "Bài nháp về máy lọc không khí mini, admin cần kiểm tra lại ảnh và câu CTA trước khi lên lịch.",
    status: "draft",
    scheduledAt: null,
    scheduledTargets: ["acc-fb-main"],
    metadata: { type: "feed", mediaPaths: ["mock/media/may-loc-mini.jpg"], comment: "Comment nháp chưa gửi." },
    createdAt: hoursAgo(22),
    updatedAt: hoursAgo(7),
    links: [],
    media: [{ id: "media-010", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/may-loc-mini/640/480", localPath: "mock/media/may-loc-mini.jpg" }],
    publishAttempts: [],
    commentQueues: [{ id: "comment-010", contentId: "content-010", targetId: "acc-fb-main", target: targetAccounts[0], commentText: "Comment nháp chưa gửi.", commentMedia: [], scheduledAt: null, status: "draft", error: null, createdAt: hoursAgo(7), updatedAt: hoursAgo(7) }]
  },
  {
    id: "content-011",
    code: "PUBRUN-0011",
    platform: "facebook",
    source: { name: "Blog deal Lazada" },
    originalText: "Đang đăng bài video ngắn về hộp cơm giữ nhiệt, worker đang upload media.",
    draftText: "Đang đăng bài video ngắn về hộp cơm giữ nhiệt, worker đang upload media.",
    status: "publishing",
    scheduledAt: hoursAgo(0.2),
    scheduledTargets: ["acc-fb-main"],
    metadata: { type: "reel", mediaPaths: ["mock/media/hop-com-video.mp4"], comment: "Thông số chi tiết ở comment." },
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(0.1),
    links: [{ id: "link-011", originalUrl: "https://lazada.vn/hop-com-giu-nhiet", convertedUrl: "https://c.lazada.vn/mock-hop-com", network: "lazada", status: "converted" }],
    media: [{ id: "media-011", type: "video", mimeType: "video/mp4", sourceUrl: "https://picsum.photos/seed/hop-com-video/640/480", localPath: "mock/media/hop-com-video.mp4" }],
    publishAttempts: [{ id: "attempt-011", targetId: "acc-fb-main", target: targetAccounts[0], status: "running", createdAt: hoursAgo(0.2) }],
    commentQueues: [{ id: "comment-011", contentId: "content-011", targetId: "acc-fb-main", target: targetAccounts[0], commentText: "Thông số chi tiết ở comment.", commentMedia: [], scheduledAt: hoursFromNow(0.2), status: "queued", error: null, createdAt: hoursAgo(0.1), updatedAt: hoursAgo(0.1) }]
  },
  {
    id: "content-012",
    code: "MAN-0012",
    platform: "threads",
    source: null,
    originalText: "Caption ngắn cho Threads: 5 món phụ kiện bàn làm việc giúp góc làm việc gọn hơn.",
    draftText: "Caption ngắn cho Threads: 5 món phụ kiện bàn làm việc giúp góc làm việc gọn hơn.",
    status: "ready_to_publish",
    scheduledAt: null,
    scheduledTargets: ["acc-thread-daily", "acc-thread-vn"],
    metadata: { type: "feed", mediaPaths: ["mock/media/desk-setup.jpg"] },
    createdAt: hoursAgo(2.5),
    updatedAt: hoursAgo(0.4),
    links: [],
    media: [{ id: "media-012", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/desk-setup/640/480", localPath: "mock/media/desk-setup.jpg" }],
    publishAttempts: [{ id: "attempt-012", targetId: "acc-thread-daily", target: targetAccounts[2], status: "pending", createdAt: hoursAgo(0.4) }],
    commentQueues: []
  },
  {
    id: "content-013",
    code: "AUTO-0013",
    platform: "facebook",
    source: { name: "Telegram Deal Hot" },
    originalText: "Deal máy xay sinh tố mini từ Telegram, đã convert link Shopee và chờ khung giờ trưa.",
    draftText: "Deal máy xay sinh tố mini từ Telegram, đã convert link Shopee và chờ khung giờ trưa.",
    status: "scheduled",
    scheduledAt: hoursFromNow(20),
    scheduledTargets: ["acc-fb-backup"],
    metadata: { type: "feed", mediaPaths: ["mock/media/may-xay-mini.jpg"], comment: "Link mua nhanh ở đây." },
    createdAt: hoursAgo(16),
    updatedAt: hoursAgo(5),
    links: [{ id: "link-013", originalUrl: "https://shopee.vn/may-xay-mini", convertedUrl: "https://s.shopee.vn/mock-may-xay", network: "shopee", status: "converted" }],
    media: [{ id: "media-013", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/may-xay-mini/640/480", localPath: "mock/media/may-xay-mini.jpg" }],
    publishAttempts: [{ id: "attempt-013", targetId: "acc-fb-backup", target: targetAccounts[3], status: "scheduled", createdAt: hoursAgo(5) }],
    commentQueues: [{ id: "comment-013", contentId: "content-013", targetId: "acc-fb-backup", target: targetAccounts[3], commentText: "Link mua nhanh ở đây.", commentMedia: [], scheduledAt: hoursFromNow(20.1), status: "pending", error: null, createdAt: hoursAgo(5), updatedAt: hoursAgo(5) }]
  },
  {
    id: "content-014",
    code: "PUB-0014",
    platform: "facebook",
    source: { name: "Page review nhà cửa" },
    originalText: "Bài đã đăng về đèn bàn cảm ứng, có ảnh sản phẩm và comment mã giảm.",
    status: "published",
    postedAt: hoursAgo(7),
    scheduledAt: hoursAgo(8),
    scheduledTargets: ["acc-fb-main"],
    metadata: { type: "feed", mediaPaths: ["mock/media/den-ban.jpg"], comment: "Mã giảm đã đăng ở comment." },
    createdAt: hoursAgo(28),
    updatedAt: hoursAgo(7),
    links: [{ id: "link-014", originalUrl: "https://shopee.vn/den-ban", convertedUrl: "https://s.shopee.vn/mock-den-ban", network: "shopee", status: "converted" }],
    media: [{ id: "media-014", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/den-ban/640/480", localPath: "mock/media/den-ban.jpg" }],
    publishAttempts: [{ id: "attempt-014", targetId: "acc-fb-main", target: targetAccounts[0], status: "published", resultUrl: "https://facebook.com/zerun.deals/posts/mock-den-ban", createdAt: hoursAgo(7) }],
    commentQueues: [{ id: "comment-014", contentId: "content-014", targetId: "acc-fb-main", target: targetAccounts[0], commentText: "Mã giảm đã đăng ở comment.", commentMedia: [{ id: "comment-media-014", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-den-ban/420/320" }], scheduledAt: hoursAgo(6.9), status: "published", resultUrl: "https://facebook.com/zerun.deals/comments/mock-den-ban", error: null, createdAt: hoursAgo(7), updatedAt: hoursAgo(6.9) }]
  },
  {
    id: "content-015",
    code: "PUB-0015",
    platform: "instagram",
    source: null,
    originalText: "Carousel skincare đã đăng thành công nhưng comment đầu tiên lỗi do checkpoint tạm thời.",
    status: "published",
    postedAt: hoursAgo(14),
    scheduledAt: hoursAgo(15),
    scheduledTargets: ["acc-ig-shop"],
    metadata: { type: "feed", mediaPaths: ["mock/media/skincare-3.jpg", "mock/media/skincare-4.jpg"], comment: "Bảng giá ưu đãi trong comment." },
    createdAt: hoursAgo(38),
    updatedAt: hoursAgo(14),
    links: [],
    media: [
      { id: "media-015-a", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/skincare-3/640/480", localPath: "mock/media/skincare-3.jpg" },
      { id: "media-015-b", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/skincare-4/640/480", localPath: "mock/media/skincare-4.jpg" }
    ],
    publishAttempts: [{ id: "attempt-015", targetId: "acc-ig-shop", target: targetAccounts[1], status: "published", resultUrl: "https://instagram.com/p/mock-skincare", createdAt: hoursAgo(14) }],
    commentQueues: [{ id: "comment-015", contentId: "content-015", targetId: "acc-ig-shop", target: targetAccounts[1], commentText: "Bảng giá ưu đãi trong comment.", commentMedia: [], scheduledAt: hoursAgo(14), status: "failed", error: "Instagram checkpoint khi gửi comment.", createdAt: hoursAgo(14), updatedAt: hoursAgo(13.8) }]
  },
  {
    id: "content-016",
    code: "SAVE-0016",
    platform: "telegram",
    source: { name: "Telegram Deal Hot" },
    originalText: "Tin Telegram có link Google Drive chứa catalogue, cần admin quyết định xóa link hay viết lại.",
    draftText: "Tin Telegram có link Google Drive chứa catalogue, cần admin quyết định xóa link hay viết lại.",
    status: "saved",
    scheduledAt: null,
    scheduledTargets: ["acc-fb-main"],
    savedReason: "Có link Google Drive chưa hỗ trợ convert tự động",
    savedSource: "auto_conversion",
    lastError: "Link Google Drive cần review",
    metadata: { type: "feed", mediaPaths: ["mock/media/catalogue.jpg"] },
    createdAt: hoursAgo(11),
    updatedAt: hoursAgo(10),
    links: [{ id: "link-016", originalUrl: "https://drive.google.com/mock-catalogue", convertedUrl: null, network: "google", status: "saved_for_review" }],
    media: [{ id: "media-016", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/catalogue/640/480", localPath: "mock/media/catalogue.jpg" }],
    publishAttempts: [],
    commentQueues: []
  },
  {
    id: "content-017",
    code: "TRASH-0017",
    platform: "instagram",
    source: null,
    originalText: "Bài cũ đã xóa khỏi lịch vì trùng chủ đề với campaign hôm qua.",
    status: "trashed",
    scheduledAt: null,
    scheduledTargets: ["acc-ig-outlet"],
    deletedAt: hoursAgo(9),
    metadata: { type: "feed", mediaPaths: ["mock/media/trash-old.jpg"] },
    createdAt: hoursAgo(80),
    updatedAt: hoursAgo(9),
    links: [],
    media: [{ id: "media-017", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/trash-old/640/480", localPath: "mock/media/trash-old.jpg" }],
    publishAttempts: [],
    commentQueues: []
  },
  {
    id: "content-018",
    code: "FAIL-0018",
    platform: "facebook",
    source: { name: "Blog deal Lazada" },
    originalText: "Bài affiliate Lazada lỗi upload media vì Cloudinary key đầu tiên hết quota.",
    draftText: "Bài affiliate Lazada lỗi upload media vì Cloudinary key đầu tiên hết quota.",
    status: "failed",
    scheduledAt: hoursAgo(3),
    scheduledTargets: ["acc-fb-backup"],
    savedReason: "Cloudinary key hết quota khi upload media",
    savedSource: "media_ingest",
    lastError: "Cloudinary quota exceeded",
    metadata: { type: "feed", mediaPaths: ["mock/media/lazada-fail.jpg"], comment: "Comment sẽ gửi sau khi retry media." },
    createdAt: hoursAgo(25),
    updatedAt: hoursAgo(2.8),
    links: [{ id: "link-018", originalUrl: "https://lazada.vn/mock-fail", convertedUrl: "https://c.lazada.vn/mock-fail-aff", network: "lazada", status: "converted" }],
    media: [{ id: "media-018", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/lazada-fail/640/480", localPath: "mock/media/lazada-fail.jpg", status: "failed", error: "Cloudinary quota exceeded" }],
    publishAttempts: [{ id: "attempt-018", targetId: "acc-fb-backup", target: targetAccounts[3], status: "failed", error: "Cloudinary quota exceeded", createdAt: hoursAgo(2.8) }],
    commentQueues: [{ id: "comment-018", contentId: "content-018", targetId: "acc-fb-backup", target: targetAccounts[3], commentText: "Comment sẽ gửi sau khi retry media.", commentMedia: [], scheduledAt: hoursAgo(3), status: "blocked", error: "Media chưa upload thành công.", createdAt: hoursAgo(3), updatedAt: hoursAgo(2.8) }]
  }
);

let autoRules: AnyRecord[] = [
  { id: "rule-001", name: "Facebook deal mẹ và bé -> đa nền tảng", description: "Tự lấy bài mới, convert Shopee/Lazada, link lạ đưa vào Kho lưu trữ.", enabled: true, sourcePlatform: "facebook", sourceAccountId: "src-fb-deal", sourceRef: "https://facebook.com/groups/deal-me-be", triggerMode: "polling", pollingIntervalMinutes: 15, targetAccountIds: ["acc-fb-main", "acc-thread-daily"], postType: "feed", includeFirstComment: true, commentMode: "original_first_comment", linkRules: { shopee: "convert", lazada: "convert", unknown: "saved_for_review" }, contentRules: { rewriteByAi: true }, mediaRules: { ingestMedia: true, storage: "cloudinary" }, scheduleRules: { mode: "random_after_convert", minMinutes: 10, maxMinutes: 60 }, createdAt: hoursAgo(120), updatedAt: hoursAgo(2), runs: [{ id: "run-001", status: "scheduled", createdAt: hoursAgo(2) }] },
  { id: "rule-002", name: "Telegram deal hot -> Facebook Page", description: "Realtime Telegram, AI rewrite optional.", enabled: false, sourcePlatform: "telegram", sourceAccountId: "src-telegram-shop", sourceRef: "@dealhot", triggerMode: "realtime", pollingIntervalMinutes: 0, targetAccountIds: ["acc-fb-main"], postType: "feed", includeFirstComment: false, commentMode: "none", linkRules: { google: "saved_for_review" }, contentRules: { rewriteByAi: false }, mediaRules: { ingestMedia: true, storage: "local" }, scheduleRules: { mode: "now" }, createdAt: hoursAgo(96), updatedAt: hoursAgo(12), runs: [{ id: "run-002", status: "saved_for_review", createdAt: hoursAgo(9), errorMessage: "Có link Google Form chưa hỗ trợ" }] }
];

autoRules.push(
  { id: "rule-003", name: "Page review nhà cửa -> Instagram Outlet", description: "Polling mỗi 30 phút, ưu tiên bài có nhiều ảnh sản phẩm.", enabled: true, sourcePlatform: "facebook", sourceAccountId: "src-fb-home", sourceRef: "https://facebook.com/review-nha-cua", triggerMode: "polling", pollingIntervalMinutes: 30, targetAccountIds: ["acc-ig-outlet"], postType: "reel", includeFirstComment: true, commentMode: "custom", customComment: "Link ưu đãi ở comment đầu tiên.", linkRules: { lazada: "convert", shopee: "convert", unknown: "saved_for_review" }, contentRules: { rewriteByAi: true, removeInvalidLinks: true }, mediaRules: { ingestMedia: true, storage: "cloudinary" }, scheduleRules: { mode: "random_window", start: "11:00", end: "14:00" }, createdAt: hoursAgo(72), updatedAt: hoursAgo(1), runs: [{ id: "run-003", status: "ready_to_publish", createdAt: hoursAgo(1) }] },
  { id: "rule-004", name: "Blog deal Lazada -> Facebook Backup", description: "Crawl web định kỳ, gặp lỗi media sẽ đưa vào Kho lưu trữ.", enabled: true, sourcePlatform: "web", sourceAccountId: "src-lazada-blog", sourceRef: "https://lazada-deal.example.vn", triggerMode: "polling", pollingIntervalMinutes: 60, targetAccountIds: ["acc-fb-backup", "acc-fb-main"], postType: "feed", includeFirstComment: false, commentMode: "none", linkRules: { lazada: "convert", unknown: "remove" }, contentRules: { rewriteByAi: false }, mediaRules: { ingestMedia: true, storage: "cloudinary", fallbackKey: true }, scheduleRules: { mode: "delay", minutes: 45 }, createdAt: hoursAgo(48), updatedAt: hoursAgo(3), runs: [{ id: "run-004", status: "failed", createdAt: hoursAgo(3), errorMessage: "Cloudinary quota exceeded" }] }
);

let autoRuns: AnyRecord[] = [
  { id: "run-001", ruleId: "rule-001", rule: { id: "rule-001", name: "Facebook deal mẹ và bé -> đa nền tảng" }, sourcePlatform: "facebook", sourceRef: "https://facebook.com/groups/deal-me-be/posts/1001", sourceExternalId: "fb-1001", originalText: "Máy hút sữa đang giảm mạnh hôm nay https://shopee.vn/may-hut-sua", processedText: "Máy hút sữa đang giảm mạnh hôm nay, freeship toàn quốc. Link mua đã sẵn sàng.", status: "scheduled", contentId: "content-001", targetAccountIds: ["acc-fb-main", "acc-thread-daily"], createdAt: hoursAgo(2), updatedAt: hoursAgo(1), links: [{ originalUrl: "https://shopee.vn/may-hut-sua", convertedUrl: "https://s.shopee.vn/mock-aff", network: "shopee", action: "converted" }], media: [{ sourceUrl: "https://picsum.photos/seed/may-hut-sua/640/480", status: "uploaded" }] },
  { id: "run-002", ruleId: "rule-002", rule: { id: "rule-002", name: "Telegram deal hot -> Facebook Page" }, sourcePlatform: "telegram", sourceRef: "@dealhot", sourceExternalId: "tg-2288", originalText: "Deal nồi chiên không dầu có link Google Form đăng ký bảo hành: https://forms.gle/mock-form", processedText: null, status: "saved_for_review", contentId: "content-002", targetAccountIds: ["acc-fb-main"], errorMessage: "Có link Google/Form/Drive chưa hỗ trợ convert", createdAt: hoursAgo(9), updatedAt: hoursAgo(8), links: [{ originalUrl: "https://forms.gle/mock-form", network: "google", action: "saved_for_review", error: "Link chưa hỗ trợ convert tự động" }], media: [{ sourceUrl: "https://picsum.photos/seed/noi-chien/640/480", status: "downloaded" }] }
];

autoRuns.push(
  { id: "run-003", ruleId: "rule-003", rule: { id: "rule-003", name: "Page review nhà cửa -> Instagram Outlet" }, sourcePlatform: "facebook", sourceRef: "https://facebook.com/review-nha-cua/posts/7007", sourceExternalId: "fb-home-7007", originalText: "Set kệ bếp mini đang giảm giá, ảnh thật đủ góc https://lazada.vn/ke-bep-mini", processedText: "Set kệ bếp mini đang giảm giá, ảnh thật đủ góc, phù hợp căn hộ nhỏ.", status: "ready_to_publish", contentId: "content-007", targetAccountIds: ["acc-ig-outlet"], createdAt: hoursAgo(1), updatedAt: hoursAgo(0.7), links: [{ originalUrl: "https://lazada.vn/ke-bep-mini", convertedUrl: "https://c.lazada.vn/mock-ke-bep", network: "lazada", action: "converted" }], media: [{ sourceUrl: "https://picsum.photos/seed/ke-bep-1/640/480", status: "uploaded" }, { sourceUrl: "https://picsum.photos/seed/ke-bep-2/640/480", status: "uploaded" }] },
  { id: "run-004", ruleId: "rule-004", rule: { id: "rule-004", name: "Blog deal Lazada -> Facebook Backup" }, sourcePlatform: "web", sourceRef: "https://lazada-deal.example.vn/hot/lazada-fail", sourceExternalId: "web-lzd-180", originalText: "Bài affiliate Lazada lỗi upload media vì Cloudinary key đầu tiên hết quota.", processedText: "Bài affiliate Lazada lỗi upload media vì Cloudinary key đầu tiên hết quota.", status: "failed", contentId: "content-018", targetAccountIds: ["acc-fb-backup"], errorMessage: "Cloudinary quota exceeded", createdAt: hoursAgo(3), updatedAt: hoursAgo(2.8), links: [{ originalUrl: "https://lazada.vn/mock-fail", convertedUrl: "https://c.lazada.vn/mock-fail-aff", network: "lazada", action: "converted" }], media: [{ sourceUrl: "https://picsum.photos/seed/lazada-fail/640/480", status: "failed", error: "Cloudinary quota exceeded" }] },
  { id: "run-005", ruleId: "rule-001", rule: { id: "rule-001", name: "Facebook deal mẹ và bé -> đa nền tảng" }, sourcePlatform: "facebook", sourceRef: "https://facebook.com/groups/deal-me-be/posts/1008", sourceExternalId: "fb-1008", originalText: "Bỉm quần size M có deal tốt trong khung giờ tối https://shopee.vn/bim-size-m", processedText: "Bỉm quần size M có deal tốt trong khung giờ tối, nội dung đã rewrite nhẹ cho tự nhiên.", status: "scheduled", contentId: "content-008", targetAccountIds: ["acc-fb-mom", "acc-fb-main"], createdAt: hoursAgo(0.8), updatedAt: hoursAgo(0.8), links: [{ originalUrl: "https://shopee.vn/bim-size-m", convertedUrl: "https://s.shopee.vn/mock-bim", network: "shopee", action: "converted" }], media: [{ sourceUrl: "https://picsum.photos/seed/bim-size-m/640/480", status: "uploaded" }] }
);

let crawlJobs: AnyRecord[] = [
  { id: "crawl-001", sourcePlatform: "facebook", sourceRef: "https://facebook.com/groups/deal-me-be", accountId: "src-fb-deal", status: "success", totalFound: 120, totalSaved: 42, totalDuplicate: 71, totalFailed: 7, options: { limit: 120 }, storageConfig: { provider: "cloudinary" }, commentOptions: { enabled: true, mode: "author", maxComments: 20 }, createdAt: hoursAgo(20), updatedAt: hoursAgo(19), startedAt: hoursAgo(20), completedAt: hoursAgo(19) },
  { id: "crawl-002", sourcePlatform: "web", sourceRef: "https://review.example.vn/deal-gia-dung", accountId: null, status: "running", totalFound: 38, totalSaved: 18, totalDuplicate: 12, totalFailed: 0, options: { limit: 100 }, storageConfig: { provider: "local" }, commentOptions: { enabled: false }, createdAt: hoursAgo(1), updatedAt: hoursAgo(0.2), startedAt: hoursAgo(1), completedAt: null }
];

crawlJobs.push(
  { id: "crawl-003", sourcePlatform: "facebook", sourceRef: "https://facebook.com/review-nha-cua", accountId: "src-fb-home", status: "partial_success", totalFound: 86, totalSaved: 31, totalDuplicate: 49, totalFailed: 6, options: { limit: 100, onlyHasMedia: true }, storageConfig: { provider: "cloudinary", keyPool: ["zerun-demo-1", "zerun-demo-2"] }, commentOptions: { enabled: true, mode: "first_comment", maxComments: 5 }, createdAt: hoursAgo(6), updatedAt: hoursAgo(5.4), startedAt: hoursAgo(6), completedAt: hoursAgo(5.4) },
  { id: "crawl-004", sourcePlatform: "telegram", sourceRef: "@dealhot", accountId: "src-telegram-shop", status: "success", totalFound: 52, totalSaved: 52, totalDuplicate: 0, totalFailed: 0, options: { limit: 52, realtimeSnapshot: true }, storageConfig: { provider: "local" }, commentOptions: { enabled: false }, createdAt: hoursAgo(14), updatedAt: hoursAgo(13.7), startedAt: hoursAgo(14), completedAt: hoursAgo(13.7) },
  { id: "crawl-005", sourcePlatform: "web", sourceRef: "https://lazada-deal.example.vn", accountId: "src-lazada-blog", status: "failed", totalFound: 19, totalSaved: 8, totalDuplicate: 7, totalFailed: 4, error: "Crawler bị chặn sau nhiều request liên tiếp", options: { limit: 50, dateRange: "7d" }, storageConfig: { provider: "cloudinary" }, commentOptions: { enabled: false }, createdAt: hoursAgo(30), updatedAt: hoursAgo(29.5), startedAt: hoursAgo(30), completedAt: hoursAgo(29.5) }
);

let crawlResults: AnyRecord[] = [
  { id: "crawl-result-001", crawlJobId: "crawl-001", platform: "facebook", sourceRef: "https://facebook.com/groups/deal-me-be", externalId: "fb-cr-100", author: "Shop Gia Dụng", sourceUrl: "https://facebook.com/mock/100", originalText: "Set hộp cơm giữ nhiệt có deal Lazada cực tốt hôm nay.", media: [{ sourceUrl: "https://picsum.photos/seed/hop-com/640/480", type: "image" }], comments: [{ author: "Shop Gia Dụng", text: "Mã giảm ở comment này." }], links: [{ originalUrl: "https://lazada.vn/hop-com", network: "lazada" }], postedAt: hoursAgo(24), status: "new", createdAt: hoursAgo(20), updatedAt: hoursAgo(20) },
  { id: "crawl-result-002", crawlJobId: "crawl-001", platform: "facebook", sourceRef: "https://facebook.com/groups/deal-me-be", externalId: "fb-cr-101", author: "Review Nhà Đẹp", sourceUrl: "https://facebook.com/mock/101", originalText: "Máy lọc không khí mini, ảnh thật đầy đủ, không có link.", media: [{ sourceUrl: "https://picsum.photos/seed/may-loc/640/480", type: "image" }], comments: [], links: [], postedAt: hoursAgo(28), status: "converted_to_content", contentId: "content-001", createdAt: hoursAgo(19), updatedAt: hoursAgo(18) }
];

crawlResults.push(
  { id: "crawl-result-003", crawlJobId: "crawl-003", platform: "facebook", sourceRef: "https://facebook.com/review-nha-cua", externalId: "fb-home-7007", author: "Nhà Đẹp Review", sourceUrl: "https://facebook.com/mock/7007", originalText: "Set kệ bếp mini đang giảm giá, ảnh thật đủ góc, phù hợp căn hộ nhỏ.", media: [{ sourceUrl: "https://picsum.photos/seed/ke-bep-1/640/480", type: "image" }, { sourceUrl: "https://picsum.photos/seed/ke-bep-2/640/480", type: "image" }], comments: [{ author: "Nhà Đẹp Review", text: "Link ưu đãi ở comment đầu tiên." }], links: [{ originalUrl: "https://lazada.vn/ke-bep-mini", network: "lazada" }], postedAt: hoursAgo(9), status: "converted_to_content", contentId: "content-007", createdAt: hoursAgo(6), updatedAt: hoursAgo(5.8) },
  { id: "crawl-result-004", crawlJobId: "crawl-004", platform: "telegram", sourceRef: "@dealhot", externalId: "tg-3012", author: "Deal Hot Bot", sourceUrl: "https://t.me/dealhot/3012", originalText: "Tin Telegram có link Google Drive chứa catalogue, cần admin review.", media: [{ sourceUrl: "https://picsum.photos/seed/catalogue/640/480", type: "image" }], comments: [], links: [{ originalUrl: "https://drive.google.com/mock-catalogue", network: "google" }], postedAt: hoursAgo(13), status: "new", createdAt: hoursAgo(13.8), updatedAt: hoursAgo(13.8) },
  { id: "crawl-result-005", crawlJobId: "crawl-005", platform: "web", sourceRef: "https://lazada-deal.example.vn", externalId: "web-lzd-180", author: "Lazada Deal Blog", sourceUrl: "https://lazada-deal.example.vn/hot/lazada-fail", originalText: "Bài affiliate Lazada lỗi upload media vì Cloudinary key đầu tiên hết quota.", media: [{ sourceUrl: "https://picsum.photos/seed/lazada-fail/640/480", type: "image" }], comments: [], links: [{ originalUrl: "https://lazada.vn/mock-fail", network: "lazada" }], postedAt: hoursAgo(32), status: "converted_to_content", contentId: "content-018", createdAt: hoursAgo(30), updatedAt: hoursAgo(29.5) },
  { id: "crawl-result-006", crawlJobId: "crawl-003", platform: "facebook", sourceRef: "https://facebook.com/review-nha-cua", externalId: "fb-home-7010", author: "Nhà Đẹp Review", sourceUrl: "https://facebook.com/mock/7010", originalText: "Đèn bàn cảm ứng có 3 chế độ sáng, bài đã crawl kèm ảnh và comment mã giảm.", media: [{ sourceUrl: "https://picsum.photos/seed/den-ban/640/480", type: "image" }], comments: [{ author: "Nhà Đẹp Review", text: "Mã giảm đã đăng ở comment." }], links: [{ originalUrl: "https://shopee.vn/den-ban", network: "shopee" }], postedAt: hoursAgo(36), status: "converted_to_content", contentId: "content-014", createdAt: hoursAgo(6), updatedAt: hoursAgo(5.6) }
);

let pendingComments: AnyRecord[] = [
  { id: "comment-001", contentId: "content-001", targetId: "acc-fb-main", commentText: "Mã giảm thêm ở comment đầu tiên.", commentMedia: [{ id: "comment-media-001", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-voucher-001/420/320" }], scheduledAt: hoursFromNow(4.2), status: "pending", error: null, content: contents[0], target: targetAccounts[0], createdAt: hoursAgo(1), updatedAt: hoursAgo(1) },
  { id: "comment-002", contentId: "content-003", targetId: "acc-ig-shop", commentText: "Inbox để nhận bảng giá ưu đãi.", commentMedia: [], scheduledAt: hoursAgo(2), status: "failed", error: "Instagram account checkpoint", content: contents[2], target: targetAccounts[1], createdAt: hoursAgo(6), updatedAt: hoursAgo(2) }
];

pendingComments.push(
  { id: "comment-007", contentId: "content-007", targetId: "acc-ig-outlet", commentText: "Link ưu đãi ở comment đầu tiên.", commentMedia: [{ id: "comment-media-007", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-ke-bep/420/320" }], scheduledAt: hoursFromNow(1.7), status: "pending", error: null, content: contents.find((item) => item.id === "content-007"), target: targetAccounts[4], createdAt: hoursAgo(0.7), updatedAt: hoursAgo(0.7) },
  { id: "comment-014", contentId: "content-014", targetId: "acc-fb-main", commentText: "Mã giảm đã đăng ở comment.", commentMedia: [{ id: "comment-media-014", type: "image", mimeType: "image/jpeg", sourceUrl: "https://picsum.photos/seed/comment-den-ban/420/320" }], scheduledAt: hoursAgo(6.9), status: "published", error: null, content: contents.find((item) => item.id === "content-014"), target: targetAccounts[0], createdAt: hoursAgo(7), updatedAt: hoursAgo(6.9) },
  { id: "comment-018", contentId: "content-018", targetId: "acc-fb-backup", commentText: "Comment sẽ gửi sau khi retry media.", commentMedia: [], scheduledAt: hoursAgo(3), status: "blocked", error: "Media chưa upload thành công.", content: contents.find((item) => item.id === "content-018"), target: targetAccounts[3], createdAt: hoursAgo(3), updatedAt: hoursAgo(2.8) }
);

let workerJobs: AnyRecord[] = [
  { id: "job-001", queueName: "auto-conversion", jobName: "auto-source-check", jobId: "run-001", status: "success", payload: { ruleId: "rule-001" }, createdAt: hoursAgo(2), startedAt: hoursAgo(2), completedAt: hoursAgo(1.9) },
  { id: "job-002", queueName: "crawl", jobName: "crawl-job-run", jobId: "crawl-002", status: "running", payload: { crawlJobId: "crawl-002" }, createdAt: hoursAgo(1), startedAt: hoursAgo(1), completedAt: null },
  { id: "job-003", queueName: "publish", jobName: "publish", jobId: "content-003", status: "failed", payload: { contentId: "content-003" }, error: "Account checkpoint", createdAt: hoursAgo(2), startedAt: hoursAgo(2), completedAt: hoursAgo(1.8) }
];

workerJobs.push(
  { id: "job-004", queueName: "auto-conversion", jobName: "auto-link-convert", jobId: "run-003", status: "success", payload: { ruleId: "rule-003", contentId: "content-007" }, createdAt: hoursAgo(1), startedAt: hoursAgo(1), completedAt: hoursAgo(0.95) },
  { id: "job-005", queueName: "media", jobName: "auto-media-ingest", jobId: "content-018", status: "failed", payload: { contentId: "content-018", provider: "cloudinary" }, error: "Cloudinary quota exceeded", createdAt: hoursAgo(3), startedAt: hoursAgo(3), completedAt: hoursAgo(2.8) },
  { id: "job-006", queueName: "publish", jobName: "publish", jobId: "content-011", status: "running", payload: { contentId: "content-011", targetId: "acc-fb-main" }, createdAt: hoursAgo(0.2), startedAt: hoursAgo(0.2), completedAt: null },
  { id: "job-007", queueName: "comment", jobName: "comment", jobId: "comment-014", status: "success", payload: { commentQueueId: "comment-014" }, createdAt: hoursAgo(6.9), startedAt: hoursAgo(6.9), completedAt: hoursAgo(6.85) },
  { id: "job-008", queueName: "crawl", jobName: "crawl-job-run", jobId: "crawl-005", status: "failed", payload: { crawlJobId: "crawl-005" }, error: "Crawler bị chặn sau nhiều request liên tiếp", createdAt: hoursAgo(30), startedAt: hoursAgo(30), completedAt: hoursAgo(29.5) }
);

const settings = {
  telegram: { botToken: "", chatId: "", enabled: false },
  ai: { provider: "openai", apiKey: "mock-key-hidden", model: "gpt-5.4", rewritePrompt: "Viết lại nội dung tự nhiên bằng tiếng Việt có dấu, giữ ý chính.", removeInvalidLinkPrompt: "Xóa hoặc viết lại đoạn chứa link không hỗ trợ." },
  cloudinary: { enabled: true, keys: [{ cloudName: "zerun-demo-1", apiKey: "demo-key-1", apiSecret: "********", priority: 1, enabled: true }] },
  affiliate: {
    networks: ["shopee", "lazada"],
    unknownLinkAction: "saved_for_review",
    accessTradeToken: "",
    accessTradeCampaignId: "",
    shopeeMode: "auto",
    shopeeAffiliateId: "",
    shopee: { enabled: true, primary: "web", fallbackEnabled: true, fallback: "accesstrade", affiliateId: "", campaignId: "", subId: "" },
    lazadaKey: "",
    lazadaSecret: "",
    lazadaToken: "",
    lazadaRegion: "VN",
    lazada: { enabled: true, primary: "api", fallbackEnabled: true, fallback: "accesstrade", campaignId: "", subId: "" },
    tiktok: { enabled: false, primary: "accesstrade", fallbackEnabled: false, fallback: "accesstrade", campaignId: "", subId: "" },
    shopeeRule: { enabled: true },
    lazadaRule: { enabled: true }
  }
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildMockSubId(subIds: string[]) {
  return subIds
    .map((item) => String(item ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, ""))
    .filter(Boolean)
    .join("-");
}

function syncShopeeMockQueue() {
  const active = shopeeBrowserJobs.find((job) => job.status === "running");
  const queued = shopeeBrowserJobs.filter((job) => job.status === "queued").map((job) => job.jobId);
  shopeeBrowserSession = {
    ...shopeeBrowserSession,
    queueStatus: {
      runningJobId: active?.jobId ?? null,
      queuedJobIds: queued,
      queuedCount: queued.length,
      paused: shopeeBrowserSession.status === "waiting_captcha" || shopeeBrowserSession.status === "login_required"
    },
    captchaLoginState: shopeeBrowserSession.status === "waiting_captcha" || shopeeBrowserSession.status === "login_required" ? shopeeBrowserSession.status : null,
    lastHealthCheckAt: new Date().toISOString()
  };
}

function progressMockShopeeJob(job: AnyRecord) {
  if (job.status === "queued") {
    Object.assign(job, { status: "running", startedAt: job.startedAt ?? new Date().toISOString() });
    shopeeBrowserSession.status = "busy";
    shopeeBrowserSession.currentUrl = "https://affiliate.shopee.vn/offer/custom_link";
  } else if (job.status === "running") {
    const convertedUrl = `https://s.shopee.vn/mock-${String(job.jobId).slice(-5)}`;
    Object.assign(job, {
      status: "success",
      convertedUrl,
      completedAt: new Date().toISOString(),
      metadata: { ...job.metadata, convertedUrl, currentUrl: shopeeBrowserSession.currentUrl }
    });
    shopeeBrowserSession.status = "ready";
    shopeeBrowserSession.lastError = null;
  }
  syncShopeeMockQueue();
  return job;
}

function parseBody(init: RequestInit = {}) {
  if (!init.body) return {};
  if (init.body instanceof FormData) {
    const body: AnyRecord = {};
    init.body.forEach((value, key) => { body[key] = value instanceof File ? value.name : value; });
    return body;
  }
  if (typeof init.body === "string") {
    try { return JSON.parse(init.body); } catch { return {}; }
  }
  return init.body as AnyRecord;
}

function getUrl(path: string) {
  return new URL(path, "http://mock.local");
}

function paginate<T>(rows: T[], url: URL) {
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const total = rows.length;
  return { rows: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
}

function filterByCommonQuery<T extends AnyRecord>(rows: T[], url: URL) {
  const keyword = (url.searchParams.get("keyword") ?? url.searchParams.get("search") ?? "").toLowerCase();
  const status = url.searchParams.get("status");
  const platform = url.searchParams.get("platform") ?? url.searchParams.get("sourcePlatform");
  return rows.filter((row) => {
    if (status && status !== "all" && row.status !== status) return false;
    if (platform && platform !== "all" && row.platform !== platform && row.sourcePlatform !== platform) return false;
    return !keyword || JSON.stringify(row).toLowerCase().includes(keyword);
  });
}

function getContentByCode(code: string) {
  return contents.find((content) => content.code === code || content.id === code);
}

function detectLinks(text: string) {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return matches.map((rawUrl) => {
    const originalUrl = rawUrl.replace(/[),.;!?]+$/, "");
    const lower = originalUrl.toLowerCase();
    const network = lower.includes("shopee") ? "shopee" : lower.includes("lazada") ? "lazada" : lower.includes("google") || lower.includes("forms.gle") ? "google" : "unknown";
    return { originalUrl, network, action: network === "shopee" || network === "lazada" ? "convert" : "saved_for_review", reason: network === "shopee" || network === "lazada" ? undefined : "Link chưa hỗ trợ convert tự động" };
  });
}

function filterContentsByPayload(filter: AnyRecord = {}) {
  const keyword = String(filter.keyword ?? filter.search ?? "").trim().toLowerCase();
  const status = String(filter.status ?? "all");
  const platform = String(filter.platform ?? "all");
  return contents.filter((content) => {
    if (status !== "all" && content.status !== status) return false;
    if (platform !== "all" && content.platform !== platform) return false;
    return !keyword || JSON.stringify(content).toLowerCase().includes(keyword);
  });
}

function applyBulkAction(body: AnyRecord) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const rows = ids.length > 0
    ? contents.filter((content) => ids.includes(content.id) || ids.includes(content.code))
    : filterContentsByPayload(body.filter);
  for (const content of rows) {
    if (body.action === "pause") content.status = "paused";
    if (body.action === "resume") content.status = "ready_to_publish";
    if (body.action === "retry") { content.status = "ready_to_publish"; content.retryCount = Number(content.retryCount ?? 0) + 1; content.lastError = null; }
    if (body.action === "cancel") { content.status = "trashed"; content.deletedAt = new Date().toISOString(); content.cancelledAt = new Date().toISOString(); }
    if (body.action === "move_to_saved") { content.status = "saved"; content.savedReason = body.reason ?? "Admin chuyển vào Kho lưu trữ"; content.savedSource = "mock"; }
    if (body.action === "move_to_trash") { content.status = "trashed"; content.deletedAt = new Date().toISOString(); }
    if (body.action === "restore") { content.status = "draft"; content.deletedAt = null; content.cancelledAt = null; }
  }
  if (body.action === "delete_forever") contents = contents.filter((content) => !rows.some((row) => row.id === content.id));
  return { affected: rows.length };
}

function createMockAccount(kind: "source" | "target", body: AnyRecord) {
  const account = {
    id: id(kind === "source" ? "src" : "acc"),
    kind,
    name: body.name ?? "Tài khoản mới",
    platform: body.platform ?? "facebook",
    handle: body.handle ?? "",
    health: "degraded",
    isActive: body.isActive ?? true,
    credentials: body.credentials ?? {},
    config: body.config ?? {},
    sessionState: ["facebook", "instagram", "threads", "x"].includes(String(body.platform)) ? { authState: "unknown" } : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  (kind === "source" ? sourceAccounts : targetAccounts).unshift(account);
  return account;
}

function updateMockAccount(rows: AnyRecord[], accountId: string, body: AnyRecord) {
  const account = rows.find((item) => item.id === accountId);
  if (!account) return null;
  Object.assign(account, body, { updatedAt: new Date().toISOString() });
  return account;
}

function deleteMockAccount(rows: AnyRecord[], accountId: string) {
  const index = rows.findIndex((item) => item.id === accountId);
  if (index >= 0) rows.splice(index, 1);
  return index >= 0;
}

function makeMockSession(platform: string, account: AnyRecord, status: string = "pending") {
  const session = {
    sessionId: id("session"),
    platform,
    accountId: account.id,
    status,
    authState: status === "completed" ? "authenticated" : "login_required",
    authDetected: status === "completed",
    browserOpen: status === "pending",
    currentUrl: platform === "facebook" ? "https://www.facebook.com/" : platform === "instagram" ? "https://www.instagram.com/" : platform === "x" ? "https://x.com/home" : "https://www.threads.net/",
    authPath: `sessions/${platform}/${account.id}/auth.json`,
    sessionDir: `sessions/${platform}/${account.id}`,
    lastCheckedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    message: status === "pending" ? `Đã mở trình duyệt ${platform} mock.` : `Đã lưu session ${platform} mock.`
  };
  browserSessions.unshift(session);
  account.sessionState = session;
  return session;
}

export async function mockApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const method = String(init.method ?? "GET").toUpperCase();
  const url = getUrl(path);
  const body = parseBody(init);
  const pathname = url.pathname;

  if (pathname === "/auth/login") return clone({ accessToken: "mock-token", refreshToken: "mock-refresh", user: { id: "admin-mock", username: "admin", displayName: "Admin Demo", role: "admin" } }) as T;
  if (pathname === "/dashboard/stats") return clone({ totalContents: contents.length, pendingJobs: contents.filter((item) => ["ready_to_publish", "scheduled", "publishing", "saved"].includes(item.status)).length, publishedToday: contents.filter((item) => item.status === "published").length, failedJobs: contents.filter((item) => item.status === "failed" || item.lastError).length, platformHealth: targetAccounts }) as T;
  if (pathname === "/dashboard/activity") return clone({ activities: [{ id: "act-001", type: "auto_conversion", message: "Rule Facebook deal mẹ và bé đã tạo bài AUTO-0001.", platform: "facebook", createdAt: hoursAgo(1) }, { id: "act-002", type: "saved", message: "Bài AUTO-SAVED-0002 được đưa vào Kho lưu trữ vì link Google Form.", platform: "telegram", createdAt: hoursAgo(2) }, { id: "act-003", type: "crawl", message: "Crawl Facebook hoàn tất: 42 bài mới, 71 bài trùng.", platform: "facebook", createdAt: hoursAgo(19) }] }) as T;

  if (pathname === "/accounts") return clone({ accounts: targetAccounts }) as T;
  if (pathname === "/sources") {
    if (method !== "GET") throw new Error("Nguồn crawl không phải tài khoản của user. Hãy nhập link nguồn ở trang Crawl dữ liệu.");
    return clone({ sources: [], deprecated: true, message: "Nguồn crawl được nhập bằng link, không tạo tài khoản nguồn trong Quản lý tài khoản." }) as T;
  }
  if (pathname === "/targets") {
    if (method === "POST") return clone({ target: createMockAccount("target", body) }) as T;
    return clone({ targets: targetAccounts }) as T;
  }
  const sourceMatch = pathname.match(/^\/sources\/([^/]+)$/);
  if (sourceMatch) {
    throw new Error("Nguồn crawl không phải tài khoản của user. Hãy nhập link nguồn ở trang Crawl dữ liệu.");
  }
  const targetMatch = pathname.match(/^\/targets\/([^/]+)$/);
  if (targetMatch) {
    if (method === "DELETE") return clone({ success: deleteMockAccount(targetAccounts, targetMatch[1]) }) as T;
    return clone({ target: updateMockAccount(targetAccounts, targetMatch[1], body) }) as T;
  }
  const sessionCheckMatch = pathname.match(/^\/accounts\/([^/]+)\/(facebook|instagram|threads|x)-session\/check$/);
  if (sessionCheckMatch) {
    const account = targetAccounts.find((item) => item.id === sessionCheckMatch[1]);
    const platform = sessionCheckMatch[2];
    const health = { status: "healthy", authState: "authenticated", checkedAt: new Date().toISOString(), message: "Mock session đang hoạt động." };
    if (account) {
      account.health = "healthy";
      account.sessionState = { ...(account.sessionState ?? {}), platform, accountId: account.id, authState: "authenticated", authDetected: true, browserOpen: false, lastCheckedAt: health.checkedAt, health };
    }
    return clone({ health }) as T;
  }
  const browserStartMatch = pathname.match(/^\/(facebook|instagram|threads|x)\/accounts\/([^/]+)\/browser-login\/start$/);
  if (browserStartMatch) {
    const account = targetAccounts.find((item) => item.id === browserStartMatch[2]);
    if (!account) return clone({}) as T;
    const existing = browserSessions.find((session) => session.accountId === account.id && session.platform === browserStartMatch[1] && session.status === "pending");
    return clone(existing ?? makeMockSession(browserStartMatch[1], account)) as T;
  }
  const browserActionMatch = pathname.match(/^\/(facebook|instagram|threads|x)\/browser-login\/([^/]+)(?:\/(complete|cancel))?$/);
  if (browserActionMatch) {
    const session = browserSessions.find((item) => item.sessionId === browserActionMatch[2]) ?? browserSessions[0];
    if (!session) return clone({}) as T;
    const account = targetAccounts.find((item) => item.id === session.accountId);
    if (browserActionMatch[3] === "complete") {
      Object.assign(session, { status: "completed", authState: "authenticated", authDetected: true, browserOpen: false, lastCheckedAt: new Date().toISOString(), message: `Đã lưu session ${session.platform} mock.` });
      if (account) {
        account.health = "healthy";
        account.credentials = { ...(account.credentials ?? {}), authPath: session.authPath, sessionDir: session.sessionDir };
        account.sessionState = session;
      }
    }
    if (browserActionMatch[3] === "cancel") {
      Object.assign(session, { status: "cancelled", browserOpen: false, lastCheckedAt: new Date().toISOString(), message: "Đã hủy phiên đăng nhập mock." });
      if (account) account.sessionState = session;
    }
    return clone(session) as T;
  }
  if (pathname.match(/^\/accounts\/[^/]+\/test$/)) return clone({ queued: true }) as T;

  if (pathname === "/contents" && method === "GET") {
    let rows = filterByCommonQuery(contents, url);
    const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;
    rows = [...rows].sort((a: AnyRecord, b: AnyRecord) => String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? "")) * sortOrder);
    const page = paginate(rows, url);
    return clone({ contents: page.rows, pagination: page.pagination }) as T;
  }
  if (pathname === "/contents/manual" && method === "POST") {
    const content = { id: id("content"), code: `MAN-${Date.now()}`, platform: body.platform ?? "manual", source: null, originalText: body.originalText ?? body.text ?? "", draftText: body.draftText ?? body.originalText ?? "", status: body.status ?? "ready_to_publish", scheduledAt: body.scheduledAt ?? null, scheduledTargets: body.targetIds ?? [], metadata: { type: body.type ?? "feed", mediaPaths: body.mediaPaths ?? [], comment: body.comment ?? "", threads: body.threads ?? undefined }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), links: [], media: [], publishAttempts: [] };
    contents.unshift(content);
    return clone({ content }) as T;
  }
  if (pathname === "/contents/bulk-action") return clone(applyBulkAction(body)) as T;
  if (pathname === "/contents/bulk-import") {
    const created = [1, 2, 3].map((index) => ({ id: id("content"), code: `IMP-${Date.now()}-${index}`, platform: "manual", source: null, originalText: `Bài import mẫu ${index}: nội dung tiếng Việt có dấu và media path từ Excel.`, status: body.scheduleMode === "now" ? "ready_to_publish" : "scheduled", scheduledAt: body.scheduledAt || hoursFromNow(index + 2), scheduledTargets: body.targetIds ? JSON.parse(String(body.targetIds)) : [], metadata: { type: "feed", bulkImport: true }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), links: [], media: [], publishAttempts: [] }));
    contents.unshift(...created);
    return clone({ created, failed: [], total: created.length }) as T;
  }
  const contentMatch = pathname.match(/^\/contents\/([^/]+)$/);
  if (contentMatch && method === "GET") {
    const content = getContentByCode(contentMatch[1]);
    if (!content) throw new Error("Không tìm thấy nội dung.");
    return clone({ content }) as T;
  }
  if (pathname.match(/^\/contents\/[^/]+\/edit$/)) return clone({ content: getContentByCode(pathname.split("/")[2]) }) as T;
  if (pathname.match(/^\/contents\/[^/]+\/publish$/)) return clone({ queued: true, targetCount: body.targetIds?.length ?? 1 }) as T;

  if (pathname === "/auto-conversion/rules") {
    if (method === "POST") { const rule = { id: id("rule"), enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), runs: [], ...body }; autoRules.unshift(rule); return clone({ rule }) as T; }
    return clone({ rules: paginate(filterByCommonQuery(autoRules, url), url).rows }) as T;
  }
  if (pathname.match(/^\/auto-conversion\/rules\/[^/]+\/(test|run-now|pause|resume)$/)) {
    const rule = autoRules.find((item) => item.id === pathname.split("/")[3]);
    if (pathname.endsWith("pause") && rule) rule.enabled = false;
    if (pathname.endsWith("resume") && rule) rule.enabled = true;
    if (pathname.endsWith("test")) return clone({ detectedItems: [{ text: body.sampleText ?? "Bài mẫu có link https://shopee.vn/demo", links: detectLinks(body.sampleText ?? "") }], warnings: ["Link Google sẽ được đưa vào Kho lưu trữ"], preview: { nextStatus: "saved_for_review" } }) as T;
    if (pathname.endsWith("run-now") && rule) { const run = { id: id("run"), ruleId: rule.id, rule: { id: rule.id, name: rule.name }, sourcePlatform: rule.sourcePlatform, sourceRef: rule.sourceRef, sourceExternalId: id("external"), originalText: "Bài mock vừa được phát hiện từ run now.", processedText: "Bài mock vừa được xử lý.", status: "ready_to_publish", targetAccountIds: rule.targetAccountIds, links: [], media: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; autoRuns.unshift(run); rule.runs = [{ id: run.id, status: run.status, createdAt: run.createdAt }]; return clone({ queued: true, jobId: id("job"), runId: run.id }) as T; }
    return clone({ rule }) as T;
  }
  if (pathname === "/auto-conversion/runs") return clone({ runs: paginate(filterByCommonQuery(autoRuns, url), url).rows }) as T;
  if (pathname.match(/^\/auto-conversion\/runs\/[^/]+\/retry$/)) return clone({ queued: true }) as T;

  if (pathname === "/crawl-jobs") {
    if (method === "POST") { const crawlJob = { id: id("crawl"), status: "pending", totalFound: 0, totalSaved: 0, totalDuplicate: 0, totalFailed: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...body }; crawlJobs.unshift(crawlJob); return clone({ crawlJob }) as T; }
    return clone({ crawlJobs: paginate(filterByCommonQuery(crawlJobs, url), url).rows }) as T;
  }
  if (pathname.match(/^\/crawl-jobs\/[^/]+\/(retry|cancel)$/)) return clone(pathname.endsWith("retry") ? { queued: true } : { crawlJob: crawlJobs[0] }) as T;
  if (pathname === "/crawl-results") return clone({ results: paginate(filterByCommonQuery(crawlResults, url), url).rows }) as T;
  if (pathname.match(/^\/crawl-results\/[^/]+\/create-content$/)) return clone({ content: contents[0] }) as T;
  if (pathname === "/crawl-results/bulk-create-content") return clone({ created: body.ids ?? [], failed: [] }) as T;
  if (pathname.match(/^\/crawl-results\/[^/]+$/) && method === "DELETE") return clone({ success: true }) as T;

  if (pathname === "/browser-sessions/shopee-main") {
    syncShopeeMockQueue();
    return clone(shopeeBrowserSession) as T;
  }
  const shopeeBrowserActionMatch = pathname.match(/^\/browser-sessions\/shopee-main\/(start|stop|restart|open|mark-resolved)$/);
  if (shopeeBrowserActionMatch) {
    const action = shopeeBrowserActionMatch[1];
    if (action === "stop") {
      shopeeBrowserSession = { ...shopeeBrowserSession, status: "stopped", currentUrl: null, lastError: null };
    } else if (action === "mark-resolved") {
      shopeeBrowserSession = { ...shopeeBrowserSession, status: "ready", lastError: null, captchaLoginState: null };
    } else {
      shopeeBrowserSession = { ...shopeeBrowserSession, status: "ready", currentUrl: "https://affiliate.shopee.vn/offer/custom_link", lastError: null };
    }
    syncShopeeMockQueue();
    return clone(shopeeBrowserSession) as T;
  }
  if (pathname === "/tools/convert-link/browser-convert" && method === "POST") {
    const subIds = Array.isArray(body.subIds) ? body.subIds.map(String) : [];
    const finalSubId = body.subId ? String(body.subId) : buildMockSubId(subIds);
    const job = {
      jobId: id("browser-convert"),
      platform: "shopee",
      originalUrl: String(body.url ?? ""),
      convertedUrl: null,
      subId: finalSubId,
      subIds,
      outputType: body.outputType ?? "shortlink",
      status: "queued",
      errorCode: null,
      errorMessage: null,
      screenshotPath: null,
      retryable: false,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      metadata: {
        platform: "shopee",
        accountId: "shopee-main",
        outputType: body.outputType ?? "shortlink",
        subIds,
        finalSubId,
        browserName: "Zerun Controlled Browser - Shopee Main",
        pageName: "Shopee Affiliate Converter Page",
        action: "browser_ui_convert"
      }
    };
    shopeeBrowserJobs.unshift(job);
    shopeeBrowserSession.status = shopeeBrowserSession.status === "not_started" ? "ready" : shopeeBrowserSession.status;
    syncShopeeMockQueue();
    return clone({ jobId: job.jobId, status: job.status, message: "Mock browser convert job đã được tạo." }) as T;
  }
  const shopeeBrowserJobMatch = pathname.match(/^\/tools\/convert-link\/browser-convert\/([^/]+)(?:\/(retry|cancel))?$/);
  if (shopeeBrowserJobMatch) {
    const job = shopeeBrowserJobs.find((item) => item.jobId === shopeeBrowserJobMatch[1]);
    if (!job) throw new Error("Không tìm thấy browser conversion job.");
    const action = shopeeBrowserJobMatch[2];
    if (method === "POST" && action === "retry") {
      Object.assign(job, { status: "queued", errorCode: null, errorMessage: null, retryable: false, completedAt: null });
      syncShopeeMockQueue();
      return clone({ jobId: job.jobId, status: job.status, message: "Đã đưa job mock vào hàng chờ retry." }) as T;
    }
    if (method === "POST" && action === "cancel") {
      Object.assign(job, { status: "cancelled", completedAt: new Date().toISOString() });
      syncShopeeMockQueue();
      return clone({ jobId: job.jobId, status: job.status, message: "Đã hủy job mock." }) as T;
    }
    return clone(progressMockShopeeJob(job)) as T;
  }
  if (pathname === "/tools/convert-link/detect") { const text = String(body.text ?? "Nội dung mẫu có link https://shopee.vn/mock và https://forms.gle/mock"); return clone({ links: detectLinks(text), batchId: id("batch") }) as T; }
  if (pathname === "/tools/convert-link/export-batch") return clone({ fileUrl: "#mock-batch-custom-links", filename: "Batch Custom Links.xlsx" }) as T;
  if (pathname === "/tools/convert-link/import-result") return clone({ total: 2, converted: 1, failed: 1, results: [{ originalUrl: "https://shopee.vn/mock", convertedUrl: "https://s.shopee.vn/mock-aff", failureReason: "" }, { originalUrl: "https://forms.gle/mock", convertedUrl: "", failureReason: "Network chưa hỗ trợ" }] }) as T;
  if (pathname === "/tools/convert-link/apply-result") return clone({ text: "Nội dung mẫu có link https://s.shopee.vn/mock-aff và link Google được giữ để admin duyệt." }) as T;
  if (pathname === "/links/convert") return clone({ results: (body.urls ?? []).map((url: string) => ({ originalUrl: url, convertedUrl: `${url}?aff=mock`, status: "converted" })) }) as T;

  if (pathname === "/schedules") return clone({ schedules: contents.filter((content) => content.scheduledAt).map((content) => ({ id: id("schedule"), content, target: targetAccounts.find((target) => content.scheduledTargets?.includes(target.id)), scheduledAt: content.scheduledAt, status: content.status === "published" ? "completed" : "scheduled" })) }) as T;
  if (pathname === "/history") {
    let attempts = contents.flatMap((content) => (content.publishAttempts ?? []).map((attempt: AnyRecord, index: number) => ({
      ...attempt,
      contentId: content.id,
      content,
      target: attempt.target ?? targetAccounts.find((target) => target.id === attempt.targetId) ?? null,
      attemptNo: attempt.attemptNo ?? index + 1,
      resultUrl: attempt.resultUrl ?? null,
      error: attempt.error ?? null
    })));
    attempts = attempts.filter((attempt) => ["published", "success"].includes(attempt.status));
    const keyword = (url.searchParams.get("keyword") ?? url.searchParams.get("search") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const platform = url.searchParams.get("platform");
    if (status && status !== "all") attempts = attempts.filter((attempt) => attempt.status === status);
    if (platform && platform !== "all") attempts = attempts.filter((attempt) => attempt.target?.platform === platform);
    if (keyword) attempts = attempts.filter((attempt) => JSON.stringify(attempt).toLowerCase().includes(keyword));
    const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;
    const valueOf = (attempt: AnyRecord) => {
      if (sortBy === "code") return attempt.content?.code ?? "";
      if (sortBy === "account") return attempt.target?.name ?? "";
      if (sortBy === "platform") return attempt.target?.platform ?? "";
      return attempt[sortBy] ?? "";
    };
    attempts = [...attempts].sort((a, b) => String(valueOf(a)).localeCompare(String(valueOf(b))) * sortOrder);
    const page = paginate(attempts, url);
    return clone({ attempts: page.rows, pagination: page.pagination }) as T;
  }
  if (pathname.match(/^\/history\/[^/]+\/comments$/)) {
    const attemptId = pathname.split("/")[2];
    const content = contents.find((item) => (item.publishAttempts ?? []).some((attempt: AnyRecord) => attempt.id === attemptId));
    return clone({ comments: content?.commentQueues ?? [] }) as T;
  }
  if (pathname === "/pending-comments") return clone({ comments: paginate(filterByCommonQuery(pendingComments, url), url).rows, pagination: paginate(filterByCommonQuery(pendingComments, url), url).pagination }) as T;
  if (pathname.match(/^\/pending-comments\/[^/]+\/(retry|reschedule)$/)) return clone({ queued: true, rescheduled: pathname.endsWith("reschedule") }) as T;
  if (pathname.match(/^\/pending-comments\/[^/]+$/) && method === "DELETE") { pendingComments = pendingComments.filter((comment) => comment.id !== pathname.split("/")[2]); return clone({ cancelled: true }) as T; }

  if (pathname === "/worker-jobs") return clone({ jobs: paginate(filterByCommonQuery(workerJobs, url), url).rows, summary: [] }) as T;
  if (pathname.match(/^\/worker-jobs\/[^/]+\/retry-log$/)) return clone({ queued: true, job: { id: id("job"), status: "queued" } }) as T;

  if (pathname === "/settings/telegram") { if (method === "PUT") Object.assign(settings.telegram, body); return clone(method === "PUT" ? { saved: true, value: settings.telegram } : settings.telegram) as T; }
  if (pathname === "/settings/ai") { if (method === "PUT") Object.assign(settings.ai, body); return clone(method === "PUT" ? { saved: true, value: settings.ai } : settings.ai) as T; }
  if (pathname === "/settings/cloudinary") { if (method === "PUT") Object.assign(settings.cloudinary, body); return clone(method === "PUT" ? { saved: true, value: settings.cloudinary } : settings.cloudinary) as T; }
  if (pathname === "/settings/affiliate") { if (method === "PUT") Object.assign(settings.affiliate, body); return clone(method === "PUT" ? { saved: true, value: settings.affiliate } : settings.affiliate) as T; }
  if (pathname === "/settings/ai/test") return clone({ output: `Ví dụ AI mock: ${body.text ?? "Nội dung tiếng Việt có dấu được giữ nguyên."}` }) as T;

  if (pathname === "/routing-rules") return clone({ rules: [{ id: "route-001", source: sourceAccounts[0], target: targetAccounts[0], autoPublish: true, useAI: true, requireReview: false, isActive: true }] }) as T;
  if (pathname === "/uploads/manual") return clone({ file: { filename: body.file ?? "mock-media.jpg", localPath: `mock/uploads/${body.file ?? "mock-media.jpg"}`, mimeType: "image/jpeg", fileSize: 123456 } }) as T;
  if (pathname === "/failed") return clone({ contents: contents.filter((content) => content.status === "failed") }) as T;
  if (pathname.match(/^\/failed\/[^/]+\/(retry|reschedule)$/)) return clone({ queued: true, rescheduled: pathname.endsWith("reschedule") }) as T;

  return clone({}) as T;
}
