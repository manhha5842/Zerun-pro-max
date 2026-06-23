import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { formatDateTime, readReviewMetadata, type RepostContent } from "./repostTypes";

type QueueTab = "action" | "links" | "targets" | "publish" | "system";

const TABS: Array<{ id: QueueTab; label: string }> = [
  { id: "action", label: "Cần xử lý" },
  { id: "links", label: "Link lỗi" },
  { id: "targets", label: "Chọn kênh đích" },
  { id: "publish", label: "Publish failed" },
  { id: "system", label: "System/AI error" }
];

function actionableReason(content: RepostContent) {
  const { review, analysis } = readReviewMetadata(content);
  const raw = String(review.routingHoldReason ?? review.heldReason ?? content.savedReason ?? content.status ?? "");
  if (/Kênh nguồn chưa được gắn vào luồng đăng lại đang bật|source_channel_not_in_flow|source.*flow/i.test(raw)) return "Kênh nguồn chưa gắn flow active";
  if (/NO_ACTIVE_TARGET|Chưa có kênh đích nào đang bật|no_active_target/i.test(raw)) return "Chưa có kênh đích nào đang bật";
  if (/NO_MATCHING_TARGET|Không có kênh đích nào nhận ngành hàng này|no_matching_target/i.test(raw)) return "Không có kênh đích nào nhận ngành hàng này";
  if (/link|convert|manual/i.test(raw) || content.status === "waiting_manual_convert") return "Link mua hàng convert lỗi, cần nhập link thủ công";
  if (/checkpoint|session|auth/i.test(raw)) return "Target account bị checkpoint hoặc hết session";
  if (/ai|system|error/i.test(raw)) return "AI hoặc hệ thống lỗi, cần chạy lại";
  return String(analysis.reason ?? (raw || "Nội dung cần thao tác thủ công trước khi đăng."));
}

function tabFor(content: RepostContent): QueueTab {
  const reason = actionableReason(content).toLowerCase();
  if (reason.includes("link") || reason.includes("convert")) return "links";
  if (reason.includes("kênh đích")) return "targets";
  if (reason.includes("checkpoint") || reason.includes("session")) return "publish";
  if (reason.includes("ai") || reason.includes("hệ thống")) return "system";
  return "action";
}

function targetStateFor(content: RepostContent) {
  const { review } = readReviewMetadata(content);
  const matched = Array.isArray(review.matchedTargetIds) ? review.matchedTargetIds.map(String) : content.scheduledTargets ?? [];
  if (matched.length > 0) {
    return {
      canPublish: true,
      label: `${matched.length} kênh`,
      tone: "good" as const,
      disabledReason: ""
    };
  }

  const reason = actionableReason(content).toLowerCase();
  if (reason.includes("kênh nguồn chưa gắn flow")) {
    return {
      canPublish: false,
      label: "Nguồn chưa gắn flow",
      tone: "warn" as const,
      disabledReason: "Kênh nguồn của nội dung này chưa nằm trong flow active nào."
    };
  }
  if (reason.includes("chưa có kênh đích nào đang bật")) {
    return {
      canPublish: false,
      label: "Không có kênh đích active",
      tone: "danger" as const,
      disabledReason: "Không có kênh đích nào đang bật nên chưa thể đăng."
    };
  }
  if (reason.includes("không có kênh đích nào nhận ngành hàng này")) {
    return {
      canPublish: false,
      label: "Không có kênh nhận ngành này",
      tone: "warn" as const,
      disabledReason: "Không có kênh đích nào nhận ngành hàng này."
    };
  }

  return {
    canPublish: false,
    label: "Chưa có kênh đích",
    tone: "warn" as const,
    disabledReason: "Nội dung này chưa có kênh đích để đăng."
  };
}

function packageSummary(content: RepostContent) {
  const { contentPackage } = readReviewMetadata(content);
  if (!contentPackage) return "1 tin";
  const rawCount = contentPackage.rawMessageIds?.length ?? 1;
  const mediaCount = contentPackage.mediaCount ?? 0;
  const linkCount = contentPackage.linkCount ?? 0;
  const confidence = typeof contentPackage.confidence === "number" ? `${Math.round(contentPackage.confidence)}%` : "-";
  return `${rawCount} tin đã gom · ${mediaCount} media · ${linkCount} link · Confidence ${confidence}`;
}

function groupingReason(content: RepostContent) {
  const { contentPackage } = readReviewMetadata(content);
  return contentPackage?.groupingReason ? String(contentPackage.groupingReason) : "";
}

function linkStateFor(content: RepostContent) {
  const links = content.links ?? [];
  const needConvert = links.filter((link) => ["detected", "failed", "unsupported"].includes(link.status) || !link.convertedUrl);
  if (needConvert.length > 0 || content.status === "waiting_manual_convert") {
    return {
      label: `${needConvert.length || links.length || 1} link cần đổi`,
      tone: "warn" as const,
      detail: "Cần convert link trước khi đăng, hệ thống sẽ không publish bằng link gốc."
    };
  }
  if (links.length === 0) return { label: "Không có link", tone: "neutral" as const, detail: "" };
  return { label: `${links.length} link đã đổi`, tone: "good" as const, detail: "" };
}

function ReviewPackageDetails({ content }: { content: RepostContent }) {
  const { contentPackage, analysis, review } = readReviewMetadata(content);
  const rawMessages = contentPackage?.rawMessages ?? [];
  const links = content.links ?? [];
  const attempts = content.publishAttempts ?? [];
  const text = content.finalText ?? content.draftText ?? content.originalText;

  return (
    <div className="review-expand">
      <div className="review-expand-grid">
        <div>
          <span>Nội dung sẽ đăng</span>
          <pre>{text}</pre>
        </div>
        <div>
          <span>Quyết định xử lý</span>
          <p>{String(review.routingHoldReason ?? review.heldReason ?? analysis.reason ?? content.savedReason ?? content.lastError ?? "Chưa có ghi chú.")}</p>
        </div>
      </div>

      {rawMessages.length > 0 ? (
        <div className="review-message-list">
          <strong>Tin nhắn trong package</strong>
          {rawMessages.map((message, index) => (
            <article className="review-message-card" key={message.id ?? `${content.id}-${index}`}>
              <div>
                <strong>{message.senderName ?? message.senderId ?? `Tin ${index + 1}`}</strong>
                <span>{formatDateTime(message.createdAt)} · {message.externalId ?? message.id}</span>
              </div>
              <pre>{message.text || "Tin nhắn không có text."}</pre>
            </article>
          ))}
        </div>
      ) : null}

      <div className="review-expand-grid">
        <div>
          <span>Link</span>
          {links.length === 0 ? (
            <p>Không có link trong content.</p>
          ) : (
            <div className="review-link-list">
              {links.map((link) => (
                <div key={link.id}>
                  <Badge tone={link.status === "converted" && link.convertedUrl ? "good" : "warn"}>{link.status}</Badge>
                  <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">{link.originalUrl}</a>
                  {link.convertedUrl ? <a href={link.convertedUrl} target="_blank" rel="noopener noreferrer">{link.convertedUrl}</a> : <span>Cần convert link trước khi đăng.</span>}
                  {link.error ? <span className="text-danger">{link.error}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <span>Lần đăng gần đây</span>
          {attempts.length === 0 ? (
            <p>Chưa có lần đăng nào.</p>
          ) : attempts.map((attempt) => (
            <p key={attempt.id}>{attempt.target?.name ?? attempt.targetId ?? "Target"} · {attempt.status} · {formatDateTime(attempt.createdAt)}{attempt.error ? ` · ${attempt.error}` : ""}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RepostReviewQueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<QueueTab>("action");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["contents", "review-queue"],
    queryFn: () => apiGet<{ contents: RepostContent[] }>("/contents?status=waiting_manual_convert,failed&limit=100")
  });

  const mutateContent = useMutation({
    mutationFn: ({ code, action }: { code: string; action: "reject" | "retry" }) => apiPost(`/contents/${code}/${action}`, {}),
    onSuccess: async (_, input) => {
      toast.success(input.action === "retry" ? "Đã chạy lại xử lý. Hệ thống sẽ convert link trước khi đăng." : "Đã cập nhật nội dung.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contents", "review-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["contents", "repost-history"] })
      ]);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const contents = query.data?.contents ?? [];
  const counts = useMemo(() => {
    const next: Record<QueueTab, number> = { action: 0, links: 0, targets: 0, publish: 0, system: 0 };
    for (const content of contents) next[tabFor(content)] += 1;
    next.action = contents.length;
    return next;
  }, [contents]);
  const visibleContents = activeTab === "action" ? contents : contents.filter((content) => tabFor(content) === activeTab);

  return (
    <div className="page-stack">
      <PageHeader
        title="Hàng chờ cần hành động"
        subtitle="Duyệt theo content package đã gom từ nhiều tin liên quan: sửa link, chọn kênh đích, chạy lại lỗi đăng hoặc lỗi hệ thống."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => query.refetch()} disabled={query.isFetching}>
            Làm mới
          </Button>
        }
      />

      <div className="tabs">
        {TABS.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? "active" : ""} type="button" onClick={() => setActiveTab(tab.id)}>
            {tab.label} <span>{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <SectionCard title="Content package cần xử lý">
        {visibleContents.length === 0 ? (
          <EmptyState title="Không có content package cần xử lý" description="Tin trùng, AI bỏ qua, video-only hoặc link rác sẽ nằm ở History/Detail thay vì hàng chờ." />
        ) : (
          <div className="review-package-list">
            {visibleContents.map((row) => {
              const expanded = expandedId === row.id;
              const targetState = targetStateFor(row);
              const linkState = linkStateFor(row);
              return (
                <article className="review-package-row" key={row.id}>
                  <div className="review-package-main">
                    <div className="content-cell">
                      <strong>{row.code}</strong>
                      <div className="table-subtle">
                        <Badge tone="neutral">Content package</Badge> {packageSummary(row)}
                      </div>
                      {groupingReason(row) ? <div className="table-subtle">Gom tin: {groupingReason(row)}</div> : null}
                      <p>{(row.finalText ?? row.draftText ?? row.originalText).slice(0, 180)}</p>
                      <div className="table-subtle">{formatDateTime(row.createdAt)}</div>
                    </div>
                    <div className="review-package-badges">
                      <Badge tone={tabFor(row) === "links" ? "warn" : tabFor(row) === "system" ? "danger" : "neutral"}>{actionableReason(row)}</Badge>
                      <Badge tone={targetState.tone}>{targetState.label}</Badge>
                      <Badge tone={linkState.tone} title={linkState.detail}>{linkState.label}</Badge>
                    </div>
                    <div className="row-actions">
                      <Button size="sm" variant="secondary" icon={expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} onClick={() => setExpandedId(expanded ? null : row.id)}>
                        {expanded ? "Ẩn chi tiết" : "Xem chi tiết"}
                      </Button>
                      <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden />} onClick={() => mutateContent.mutate({ code: row.code, action: "retry" })} disabled={mutateContent.isPending}>
                        Chạy lại
                      </Button>
                      <Button size="sm" variant="danger" icon={<XCircle aria-hidden />} onClick={() => mutateContent.mutate({ code: row.code, action: "reject" })} disabled={mutateContent.isPending}>
                        Từ chối
                      </Button>
                    </div>
                  </div>
                  {expanded ? <ReviewPackageDetails content={row} /> : null}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
