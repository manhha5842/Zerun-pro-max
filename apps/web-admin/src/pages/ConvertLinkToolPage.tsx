import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clipboard, Play, RefreshCw } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { useToast } from "../components/ui/Toast";
import { fromOldPayload, type LazadaSubIdSet } from "../services/affiliateService";

type ExtensionStatus = {
  wsUrl: string;
  connected: boolean;
  busy: boolean;
  currentTaskId: string | null;
  lastError: string | null;
  lastResult: ExtensionConvertResponse | null;
};

type ExtensionConvertResponse = {
  status: "DONE" | "FAILED" | "NEED_LOGIN" | "NEED_MANUAL_VERIFY" | "TIMEOUT";
  success: boolean;
  originalUrl: string;
  convertedUrl?: string | null;
  shortLink?: string | null;
  longLink?: string | null;
  rawLongLink?: string | null;
  errorCode?: string | null;
  failCode?: string | null;
  message?: string | null;
  via?: string | null;
  meta?: unknown;
};

function isShopeeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "shopee.vn"
      || host.endsWith(".shopee.vn")
      || host === "s.shopee.vn"
      || host === "shopee.ee"
      || host.includes("shopee.");
  } catch {
    return false;
  }
}

function isLazadaUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "lazada.vn"
      || host.endsWith(".lazada.vn")
      || host === "s.lazada.vn"
      || host.includes("lazada.");
  } catch {
    return false;
  }
}

function sanitizeSubId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]/g, "");
}

function buildFinalSubId(subIds: string[]) {
  return subIds.map(sanitizeSubId).filter(Boolean).join("");
}

function extensionBadge(status: ExtensionStatus | null, isLoading: boolean) {
  if (isLoading && !status) return { text: "Đang kiểm tra", tone: "neutral" as const };
  if (!status?.connected) return { text: "Chưa kết nối", tone: "danger" as const };
  if (status.busy) return { text: "Đang xử lý", tone: "warn" as const };
  return { text: "Đã kết nối", tone: "good" as const };
}

function resultErrorMessage(result: ExtensionConvertResponse | null, directError: string) {
  if (directError) return directError;
  if (!result || result.success) return "";
  return result.message || result.errorCode || result.failCode || "Không convert được link.";
}

export function ConvertLinkToolPage() {
  const toast = useToast();
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [platform, setPlatform] = useState<"shopee" | "lazada">("shopee");
  const [directUrl, setDirectUrl] = useState("");
  const [subIds, setSubIds] = useState(["", "", "", "", ""]);
  const [directError, setDirectError] = useState("");
  const [directResult, setDirectResult] = useState<ExtensionConvertResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [selectedLazadaSetId, setSelectedLazadaSetId] = useState("");

  const finalSubIdPreview = useMemo(() => buildFinalSubId(subIds), [subIds]);

  // Load Lazada Sub ID sets from settings
  const affiliateConfigQuery = useQuery({
    queryKey: ["settings", "affiliate"],
    queryFn: () => apiGet<any>("/settings/affiliate")
  });

  const lazadaSubIdSets = useMemo(() => {
    const data = affiliateConfigQuery.data;
    if (!data) return [];
    try {
      const parsed = fromOldPayload(data);
      return parsed.lazada?.subIdSets || [];
    } catch {
      return [];
    }
  }, [affiliateConfigQuery.data]);

  useEffect(() => {
    if (lazadaSubIdSets.length > 0) {
      const defaultSet = lazadaSubIdSets.find((s) => s.isDefault) || lazadaSubIdSets[0];
      if (defaultSet) {
        setSelectedLazadaSetId(defaultSet.id);
      }
    }
  }, [lazadaSubIdSets]);

  // Tự động nhận diện nền tảng từ URL dán vào
  useEffect(() => {
    const url = directUrl.trim();
    if (isLazadaUrl(url)) {
      setPlatform("lazada");
    } else if (isShopeeUrl(url)) {
      setPlatform("shopee");
    }
  }, [directUrl]);

  const extensionStatusQuery = useQuery({
    queryKey: ["shopee-extension-status"],
    queryFn: () => apiGet<ExtensionStatus>("/tools/convert-link/extension-status"),
    refetchInterval: 3_000
  });

  const extensionStatus = extensionStatusQuery.data ?? null;
  const isExtensionReady = Boolean(extensionStatus?.connected && !extensionStatus.busy);
  const badge = extensionBadge(extensionStatus, extensionStatusQuery.isLoading);
  const shortLink = directResult?.shortLink || 
    (directResult?.convertedUrl?.startsWith("https://s.shopee.") || directResult?.convertedUrl?.startsWith("https://s.lazada.") 
      ? directResult.convertedUrl 
      : "");
  const fullLink = directResult?.longLink || directResult?.rawLongLink || (!shortLink ? directResult?.convertedUrl || "" : "");
  const hasResult = Boolean(directResult || directError);
  const errorMessage = resultErrorMessage(directResult, directError);

  useEffect(() => {
    if (!hasResult) return;
    resultRef.current?.focus();
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hasResult]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(""), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const convertMutation = useMutation({
    mutationFn: () => {
      const url = directUrl.trim();
      if (!url) throw new Error(`URL ${platform === "shopee" ? "Shopee" : "Lazada"} cần convert không được để trống.`);
      if (platform === "shopee" && !isShopeeUrl(url)) {
        throw new Error("Chỉ chấp nhận link Shopee, s.shopee.vn hoặc shopee.ee.");
      }
      if (platform === "lazada" && !isLazadaUrl(url)) {
        throw new Error("Chỉ chấp nhận link Lazada hoặc s.lazada.vn.");
      }

      const payload: any = {
        url,
        outputType: "shortlink"
      };

      if (platform === "shopee") {
        payload.subIds = subIds;
      } else {
        const targetSet = lazadaSubIdSets.find((s) => s.id === selectedLazadaSetId);
        if (targetSet) {
          payload.lazadaSubIdSet = targetSet;
        }
      }

      return apiPost<ExtensionConvertResponse>("/tools/convert-link/extension-convert", payload);
    },
    onSuccess: (data) => {
      setDirectResult(data);
      setDirectError("");
      setCopiedKey("");
      void extensionStatusQuery.refetch();
      if (data.success) {
        toast.success(`Đã convert link ${platform === "shopee" ? "Shopee" : "Lazada"} bằng extension.`);
      } else {
        toast.error(data.message ?? data.errorCode ?? "Không convert được link.");
      }
    },
    onError: (error) => {
      setDirectResult(null);
      setDirectError(error.message);
      toast.error(error.message);
    }
  });

  const updateSubId = (index: number, value: string) => {
    setSubIds((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  };

  const copyText = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không copy được link.");
    }
  };

  const copyAll = async () => {
    const lines = [
      shortLink ? `Shorten link: ${shortLink}` : "",
      fullLink ? `Full affiliate link: ${fullLink}` : ""
    ].filter(Boolean);
    if (lines.length === 0) return;
    await copyText(lines.join("\n"), "all");
  };

  const retryConvert = () => {
    setDirectError("");
    convertMutation.mutate();
  };

  return (
    <div className="convert-page">
      <PageHeader
        title="Convert link affiliate"
        subtitle="Convert link Shopee và Lazada bằng extension đang kết nối với browser."
        actions={(
          <div className="convert-header-actions">
            <Badge tone={badge.tone}>Extension: {badge.text}</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden />}
              onClick={() => void extensionStatusQuery.refetch()}
              disabled={extensionStatusQuery.isFetching}
            >
              {extensionStatus?.connected ? "Làm mới" : "Kết nối lại"}
            </Button>
          </div>
        )}
      />

      <main className="convert-shell">
        <SectionCard title="Convert link Shopee / Lazada">
          <div className="convert-form">
            <div className="convert-field convert-field-full">
              <Label>Chọn nền tảng tiếp thị liên kết</Label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="radio"
                    name="platform"
                    value="shopee"
                    checked={platform === "shopee"}
                    onChange={() => setPlatform("shopee")}
                    className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                  />
                  Shopee
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="radio"
                    name="platform"
                    value="lazada"
                    checked={platform === "lazada"}
                    onChange={() => setPlatform("lazada")}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  Lazada
                </label>
              </div>
            </div>

            <label className="convert-field convert-field-full">
              <Label>URL {platform === "shopee" ? "Shopee" : "Lazada"} cần convert</Label>
              <Input
                value={directUrl}
                onChange={(event) => setDirectUrl(event.target.value)}
                placeholder={platform === "shopee" ? "Dán link Shopee hoặc s.shopee.vn..." : "Dán link Lazada hoặc s.lazada.vn..."}
              />
            </label>

            {platform === "shopee" ? (
              <div className="convert-subids">
                <div className="convert-subids-head">
                  <Label>Sub ID Shopee</Label>
                  {finalSubIdPreview ? <span>Sub ID gửi đi: <code>{finalSubIdPreview}</code></span> : null}
                </div>
                <div className="convert-subid-grid">
                  {subIds.map((subId, index) => (
                    <label key={index} className="convert-field">
                      <Label>{`Sub_id${index + 1}`}</Label>
                      <Input value={subId} onChange={(event) => updateSubId(index, event.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="convert-subids">
                <div className="convert-subids-head">
                  <Label>Chọn Set Sub ID Lazada</Label>
                </div>
                <div className="flex flex-col gap-3 mt-1.5">
                  <select
                    value={selectedLazadaSetId}
                    onChange={(e) => setSelectedLazadaSetId(e.target.value)}
                    className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {lazadaSubIdSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name} {set.isDefault ? "(Mặc định)" : ""}
                      </option>
                    ))}
                  </select>

                  {(() => {
                    const currentSet = lazadaSubIdSets.find((s) => s.id === selectedLazadaSetId);
                    if (!currentSet) return null;
                    const subIdItems = [
                      { label: "Sub 1", val: currentSet.subId1 },
                      { label: "Sub 2", val: currentSet.subId2 },
                      { label: "Sub 3", val: currentSet.subId3 },
                      { label: "Sub 4", val: currentSet.subId4 },
                      { label: "Sub 5", val: currentSet.subId5 },
                      { label: "Sub 6", val: currentSet.subId6 }
                    ].filter(item => item.val);

                    return (
                      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-line bg-[var(--color-bg-muted)]">
                        {subIdItems.length === 0 ? (
                          <span className="text-xs text-muted">Set Sub ID này trống.</span>
                        ) : (
                          subIdItems.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-panel border border-line text-xs font-medium text-foreground">
                              <span className="text-muted">{item.label}:</span>
                              <code className="font-mono text-xs">{item.val}</code>
                            </span>
                          ))
                        )}
                        {currentSet.subIdKey && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-xs font-semibold text-[var(--color-success)] ml-auto">
                            Đã đồng bộ Key: <code className="font-mono text-xs">{currentSet.subIdKey}</code>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="convert-actions">
              <Button
                icon={convertMutation.isPending ? undefined : <Play size={16} aria-hidden />}
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending || !directUrl.trim() || !isExtensionReady}
              >
                {convertMutation.isPending ? "Đang convert..." : "Convert link"}
              </Button>
              {!extensionStatus?.connected ? <span className="convert-inline-note danger">Extension chưa kết nối.</span> : null}
              {extensionStatus?.busy ? <span className="convert-inline-note warn">Extension đang xử lý link khác.</span> : null}
            </div>
          </div>

          {hasResult ? (
            <div ref={resultRef} tabIndex={-1} className="convert-result" aria-live="polite">
              {directResult?.success ? (
                <>
                  <div className="convert-result-head">
                    <h3>Kết quả</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={copiedKey === "all" ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />}
                      onClick={copyAll}
                      disabled={!shortLink && !fullLink}
                    >
                      {copiedKey === "all" ? "Đã copy" : "Copy tất cả"}
                    </Button>
                  </div>

                  <LinkResultRow
                    label="Shorten link"
                    value={shortLink}
                    copied={copiedKey === "short"}
                    onCopy={() => void copyText(shortLink, "short")}
                  />
                  <LinkResultRow
                    label="Full affiliate link"
                    value={fullLink}
                    copied={copiedKey === "full"}
                    onCopy={() => void copyText(fullLink, "full")}
                  />
                </>
              ) : (
                <div className="convert-alert">
                  <div>
                    <strong>Không convert được link.</strong>
                    <p>{errorMessage}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={retryConvert} disabled={convertMutation.isPending || !isExtensionReady}>
                    Thử lại
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {import.meta.env.DEV ? (
            <details className="convert-debug">
              <summary>Debug extension</summary>
              <dl>
                <div><dt>WebSocket</dt><dd>{extensionStatus?.wsUrl ?? "ws://localhost:17385"}</dd></div>
                <div><dt>Trạng thái</dt><dd>{extensionStatus?.busy ? "Đang xử lý" : "Sẵn sàng"}</dd></div>
                <div><dt>Task hiện tại</dt><dd>{extensionStatus?.currentTaskId ?? "-"}</dd></div>
                <div><dt>Lỗi gần nhất</dt><dd>{extensionStatus?.lastError ?? "-"}</dd></div>
              </dl>
            </details>
          ) : null}
        </SectionCard>
      </main>
    </div>
  );
}

function LinkResultRow({
  label,
  value,
  copied,
  onCopy
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="convert-link-row">
      <Label>{label}</Label>
      <div className="convert-link-control">
        <Input readOnly value={value || "-"} />
        <Button
          variant="outline"
          size="sm"
          icon={copied ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />}
          onClick={onCopy}
          disabled={!value}
        >
          {copied ? "Đã copy" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
