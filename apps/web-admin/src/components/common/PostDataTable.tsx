import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { StatusBadge } from "./StatusBadge";

export type PostCommentRow = {
  id: string;
  commentText: string;
  commentMedia?: Array<PostMediaRow | string>;
  status: string;
  scheduledAt?: string | null;
  resultUrl?: string | null;
  error?: string | null;
};

export type PostMediaRow = {
  id?: string;
  type?: string;
  mimeType?: string;
  sourceUrl?: string;
  localPath?: string;
  cloudinaryUrl?: string;
  status?: string;
  error?: string | null;
};

export type PostLinkRow = {
  id?: string;
  originalUrl: string;
  convertedUrl?: string | null;
  network?: string;
  status?: string;
  action?: string;
  error?: string | null;
};

export type PostAttemptRow = {
  id?: string;
  targetId?: string;
  target?: { name: string; platform: string } | null;
  status: string;
  resultUrl?: string | null;
  error?: string | null;
  createdAt?: string;
};

export type PostRow = {
  id: string;
  code: string;
  platform: string;
  status: string;
  originalText: string;
  draftText?: string | null;
  finalText?: string | null;
  savedReason?: string | null;
  lastError?: string | null;
  scheduledAt?: string | null;
  postedAt?: string | null;
  deletedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledTargets?: string[] | null;
  metadata?: {
    comment?: string;
    commentMedia?: Array<PostMediaRow | string>;
    mediaPaths?: string[];
    type?: string;
  };
  media?: PostMediaRow[];
  links?: PostLinkRow[];
  commentQueues?: PostCommentRow[];
  comments?: PostCommentRow[];
  publishAttempts?: PostAttemptRow[];
  source?: { name: string } | null;
};

type PostDataTableColumn = {
  key: string;
  header: ReactNode;
  render: (row: PostRow) => ReactNode;
};

function shorten(value: string | null | undefined, max = 120) {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max).trimEnd()}...` : value;
}

export function postCommentsOf(post: PostRow): PostCommentRow[] {
  const rows = post.commentQueues ?? post.comments ?? [];
  if (rows.length > 0) return rows;
  if (post.metadata?.comment) {
    return [{
      id: `${post.id}-metadata-comment`,
      commentText: post.metadata.comment,
      commentMedia: post.metadata.commentMedia,
      status: post.status === "scheduled" ? "pending" : "draft",
      scheduledAt: post.scheduledAt ?? null
    }];
  }
  return [];
}

export function postMediaOf(post: PostRow): PostMediaRow[] {
  if (post.media?.length) return post.media;
  return (post.metadata?.mediaPaths ?? []).map((path, index) => ({
    id: `${post.id}-media-${index}`,
    localPath: path,
    sourceUrl: path
  }));
}

function postTargetLabel(post: PostRow) {
  const firstTarget = post.publishAttempts?.find((attempt) => attempt.target?.name)?.target?.name;
  if (firstTarget) return firstTarget;
  const count = post.scheduledTargets?.length ?? 0;
  return count > 0 ? `${count} tài khoản` : "-";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "-";
}

function mediaSrc(media: PostMediaRow) {
  return media.cloudinaryUrl ?? media.sourceUrl ?? media.localPath ?? "";
}

function normalizeCommentMedia(comment: PostCommentRow): PostMediaRow[] {
  return (comment.commentMedia ?? []).map((item, index) => {
    if (typeof item === "string") {
      return { id: `${comment.id}-comment-media-${index}`, sourceUrl: item, localPath: item };
    }
    return item;
  });
}

export function PostDataTable({
  rows,
  empty,
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  timeHeader = "Cập nhật",
  getTimeValue = (row) => row.updatedAt,
  extraColumns = [],
  actions,
  detailNote
}: {
  rows: PostRow[];
  empty?: ReactNode;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  timeHeader?: ReactNode;
  getTimeValue?: (row: PostRow) => string | null | undefined;
  extraColumns?: PostDataTableColumn[];
  actions?: (row: PostRow) => ReactNode;
  detailNote?: (row: PostRow) => ReactNode;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ post: PostRow; media: PostMediaRow; index: number } | null>(null);

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const toggleSelection = (row: PostRow, checked: boolean) => {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(checked ? [...new Set([...selectedIds, row.id])] : selectedIds.filter((id) => id !== row.id));
  };

  const baseColumnSpan = useMemo(() => 7 + (selectable ? 1 : 0) + extraColumns.length + (actions ? 1 : 0), [actions, extraColumns.length, selectable]);

  if (rows.length === 0) {
    return <>{empty ?? <div className="text-muted" style={{ padding: 16 }}>Chưa có dữ liệu.</div>}</>;
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table table-compact post-data-table">
          <thead>
            <tr>
              <th style={{ width: 38 }} />
              {selectable ? (
                <th style={{ width: 38 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => onSelectedIdsChange?.(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
              ) : null}
              <th>Mã bài</th>
              <th>Nội dung</th>
              <th>Tài khoản</th>
              <th>Nền tảng</th>
              <th>Trạng thái</th>
              <th>{timeHeader}</th>
              {extraColumns.map((column) => <th key={column.key}>{column.header}</th>)}
              {actions ? <th>Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => {
              const media = postMediaOf(post);
              const comments = postCommentsOf(post);
              const expanded = expandedId === post.id;

              return (
                <Fragment key={post.id}>
                  <tr className="clickable-row" onClick={() => setExpandedId(expanded ? null : post.id)}>
                    <td>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedId(expanded ? null : post.id);
                        }}
                        aria-label="Mở chi tiết"
                      >
                        {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                      </button>
                    </td>
                    {selectable ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(post.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => toggleSelection(post, event.target.checked)}
                        />
                      </td>
                    ) : null}
                    <td><strong>{post.code}</strong></td>
                    <td>
                      <div>{shorten(post.finalText ?? post.draftText ?? post.originalText, 118)}</div>
                      <div className="table-subtle">{post.metadata?.type ?? "feed"} · {post.links?.length ?? 0} link</div>
                    </td>
                    <td>{postTargetLabel(post)}</td>
                    <td>{post.platform}</td>
                    <td><StatusBadge status={post.status} /></td>
                    <td>{formatDate(getTimeValue(post))}</td>
                    {extraColumns.map((column) => <td key={column.key}>{column.render(post)}</td>)}
                    {actions ? (
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="row-actions">{actions(post)}</div>
                      </td>
                    ) : null}
                  </tr>

                  {expanded ? (
                    <tr className="expanded-row">
                      <td colSpan={baseColumnSpan}>
                        <PostExpandedDetail
                          post={post}
                          media={media}
                          comments={comments}
                          onPreviewMedia={(item, index) => setPreviewMedia({ post, media: item, index })}
                          detailNote={detailNote?.(post)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {previewMedia ? (
        <Dialog open onClose={() => setPreviewMedia(null)} title={`Chi tiết media ${previewMedia.index + 1} · ${previewMedia.post.code}`}>
          <div className="media-modal-body">
            {mediaSrc(previewMedia.media).startsWith("http") ? (
              <img src={mediaSrc(previewMedia.media)} alt={`Media ${previewMedia.index + 1} của ${previewMedia.post.code}`} />
            ) : (
              <div className="media-preview-fallback">{mediaSrc(previewMedia.media)}</div>
            )}
            <div className="detail-grid">
              <span>Loại</span><strong>{previewMedia.media.mimeType ?? previewMedia.media.type ?? "media"}</strong>
              <span>Trạng thái</span><StatusBadge status={previewMedia.media.status ?? "completed"} />
              <span>Nguồn</span><strong>{mediaSrc(previewMedia.media) || "-"}</strong>
              {previewMedia.media.error ? <><span>Lỗi</span><strong className="text-danger">{previewMedia.media.error}</strong></> : null}
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function PostExpandedDetail({
  post,
  media,
  comments,
  onPreviewMedia,
  detailNote
}: {
  post: PostRow;
  media: PostMediaRow[];
  comments: PostCommentRow[];
  onPreviewMedia: (media: PostMediaRow, index: number) => void;
  detailNote?: ReactNode;
}) {
  return (
    <div className="expanded-content post-expanded-content">
      <section>
        <h3>Nội dung đầy đủ</h3>
        <p>{post.finalText ?? post.draftText ?? post.originalText}</p>
        {detailNote ? <div className="inline-note warning detail-note">{detailNote}</div> : null}

        <h3 className="detail-section-title">Media</h3>
        {media.length === 0 ? (
          <p className="table-subtle">Bài viết chưa có media.</p>
        ) : (
          <div className="media-preview-grid media-preview-grid-compact">
            {media.map((item, index) => {
              const src = mediaSrc(item);
              return (
                <button key={item.id ?? `${post.id}-media-${index}`} className="media-preview-card media-preview-card-button" type="button" onClick={() => onPreviewMedia(item, index)}>
                  {src.startsWith("http") ? <img src={src} alt={`Media ${index + 1} của ${post.code}`} /> : <div className="media-preview-fallback">{src}</div>}
                  <small>{item.mimeType ?? item.type ?? "media"} · {index + 1}</small>
                </button>
              );
            })}
          </div>
        )}

        <h3 className="detail-section-title">Link</h3>
        {post.links?.length ? (
          <div className="detail-list">
            {post.links.map((link, index) => (
              <div key={link.id ?? `${post.id}-link-${index}`} className="detail-list-item">
                <div>
                  <strong>{link.network ?? "link"}</strong>
                  <p>{link.originalUrl}</p>
                  {link.convertedUrl ? <p className="table-subtle">{link.convertedUrl}</p> : null}
                  {link.error ? <p className="text-danger">{link.error}</p> : null}
                </div>
                <StatusBadge status={link.status ?? link.action ?? "pending"} />
              </div>
            ))}
          </div>
        ) : <p className="table-subtle">Bài viết chưa có link.</p>}
      </section>

      <section>
        <h3>Comment của bài viết</h3>
        {comments.length === 0 ? (
          <p className="table-subtle">Bài viết chưa có comment.</p>
        ) : (
          <div className="comment-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div>
                  <strong>Nội dung bình luận</strong>
                  <p>{comment.commentText}</p>
                  {comment.error ? <p className="text-danger">{comment.error}</p> : null}
                  {comment.scheduledAt ? <p className="table-subtle">Hẹn: {formatDate(comment.scheduledAt)}</p> : null}
                  {comment.resultUrl ? <a href={comment.resultUrl} target="_blank" rel="noreferrer">Xem comment</a> : null}
                  {normalizeCommentMedia(comment).length > 0 ? (
                    <div className="media-preview-grid media-preview-grid-compact comment-media-grid">
                      {normalizeCommentMedia(comment).map((item, index) => {
                        const src = mediaSrc(item);
                        return (
                          <button key={item.id ?? `${comment.id}-media-${index}`} className="media-preview-card media-preview-card-button" type="button" onClick={() => onPreviewMedia(item, index)}>
                            {src.startsWith("http") ? <img src={src} alt={`Media bình luận ${index + 1}`} /> : <div className="media-preview-fallback">{src}</div>}
                            <small>{item.mimeType ?? item.type ?? "media"} · {index + 1}</small>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <StatusBadge status={comment.status} />
              </div>
            ))}
          </div>
        )}

        <h3 className="detail-section-title">Lần đăng</h3>
        {post.publishAttempts?.length ? (
          <div className="detail-line-list">
            {post.publishAttempts.map((attempt, index) => (
              <div key={attempt.id ?? `${post.id}-attempt-${index}`} className="detail-line-item">
                <div>
                  <strong>{attempt.target?.name ?? attempt.targetId ?? "Tài khoản"}</strong>
                  <p className="table-subtle">{attempt.target?.platform ?? post.platform} · {formatDate(attempt.createdAt)}</p>
                  {attempt.resultUrl ? <a href={attempt.resultUrl} target="_blank" rel="noreferrer">Xem bài</a> : null}
                  {attempt.error ? <p className="text-danger">{attempt.error}</p> : null}
                </div>
                <StatusBadge status={attempt.status} />
              </div>
            ))}
          </div>
        ) : <p className="table-subtle">Chưa có lần đăng.</p>}
      </section>
    </div>
  );
}
