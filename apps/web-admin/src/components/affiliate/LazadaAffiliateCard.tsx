import { useMemo, useState } from "react";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { mapLazadaSubIdsBySource, type LazadaConfig, type LazadaSubIdSet } from "../../services/affiliateService";
import { AffiliateMethodCard } from "./AffiliateMethodCard";
import { PlatformAffiliateCard, type AffiliateMethodOption } from "./PlatformAffiliateCard";
import type { MethodStatus } from "./MethodStatusBadge";
import type { MethodTestState } from "./ShopeeAffiliateCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/Table";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { apiPost } from "../../api/client";
import { Plus, Trash2, Edit3, Check, Loader2, AlertTriangle } from "lucide-react";

type LazadaMethod = LazadaConfig["primarySource"];

type LazadaAffiliateCardProps = {
  config: LazadaConfig;
  tests: Partial<Record<LazadaMethod, MethodTestState>>;
  isSaving?: boolean;
  onChange: (patch: Partial<LazadaConfig>) => void;
  onSave: () => void;
  onTest: (method: LazadaMethod) => void;
};

function testAwareStatus(configured: boolean, test?: MethodTestState, comingSoon = false): MethodStatus {
  if (comingSoon) return "coming_soon";
  if (test?.status === "passed") return "test_passed";
  if (test?.status === "failed") return "test_failed";
  return configured ? "configured" : "not_configured";
}

function platformStatus(enabled: boolean, methods: Array<AffiliateMethodOption<LazadaMethod>>) {
  if (!enabled) return "disabled" as const;
  if (methods.some((method) => method.status === "test_failed")) return "test_failed" as const;
  if (methods.some((method) => method.status === "test_passed")) return "test_success" as const;
  if (methods.some((method) => method.status === "configured")) return "ready" as const;
  return "missing" as const;
}

export function LazadaAffiliateCard({ config, tests, isSaving, onChange, onSave, onTest }: LazadaAffiliateCardProps) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<Record<LazadaMethod, boolean>>({
    lazada_api: false,
    web: true,
    accesstrade: false
  });

  // Modal states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingSet, setEditingSet] = useState<LazadaSubIdSet | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formSubId1, setFormSubId1] = useState("");
  const [formSubId2, setFormSubId2] = useState("");
  const [formSubId3, setFormSubId3] = useState("");
  const [formSubId4, setFormSubId4] = useState("");
  const [formSubId5, setFormSubId5] = useState("");
  const [formSubId6, setFormSubId6] = useState("");

  const accessTradeConfigured = Boolean(config.accessTradeToken.trim() && config.campaignId.trim());

  // Set mặc định hiện tại
  const defaultSet = useMemo(() => {
    const sets = config.subIdSets || [];
    return sets.find((s) => s.isDefault) || sets[0];
  }, [config.subIdSets]);

  const accessTradeWarning = useMemo(() => {
    if (!defaultSet) return undefined;
    return mapLazadaSubIdsBySource(defaultSet, "accesstrade").warning;
  }, [defaultSet]);

  const methods = useMemo<Array<AffiliateMethodOption<LazadaMethod>>>(() => [
    { value: "web", label: "Zerun Extension", status: testAwareStatus(true, tests.web) },
    { value: "accesstrade", label: "AccessTrade", status: testAwareStatus(accessTradeConfigured, tests.accesstrade) }
  ], [accessTradeConfigured, tests]);

  const setMethodExpanded = (method: LazadaMethod) => setExpanded((current) => ({ ...current, [method]: !current[method] }));

  // Mở modal thêm mới
  const handleAddClick = () => {
    setEditingSet(null);
    setFormName("");
    setFormSubId1("");
    setFormSubId2("");
    setFormSubId3("");
    setFormSubId4("");
    setFormSubId5("");
    setFormSubId6("");
    setIsDialogOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleEditClick = (set: LazadaSubIdSet) => {
    setEditingSet(set);
    setFormName(set.name);
    setFormSubId1(set.subId1);
    setFormSubId2(set.subId2);
    setFormSubId3(set.subId3);
    setFormSubId4(set.subId4);
    setFormSubId5(set.subId5);
    setFormSubId6(set.subId6);
    setIsDialogOpen(true);
  };

  // Lưu hoặc Cập nhật Set
  const handleSaveSet = async () => {
    if (!formName.trim()) {
      toast.error("Vui lòng nhập tên gợi nhớ cho Set Sub ID.");
      return;
    }

    setIsSyncing(true);
    try {
      const action = editingSet ? "edit" : "add";
      const payload = {
        id: editingSet?.id || `set_${Math.random().toString(36).slice(2, 11)}`,
        name: formName.trim(),
        subId1: formSubId1.trim(),
        subId2: formSubId2.trim(),
        subId3: formSubId3.trim(),
        subId4: formSubId4.trim(),
        subId5: formSubId5.trim(),
        subId6: formSubId6.trim(),
        isDefault: editingSet ? editingSet.isDefault : (config.subIdSets?.length === 0),
        subIdKey: editingSet?.subIdKey || ""
      };

      const res = await apiPost<{ success: boolean; subIdSets: LazadaSubIdSet[]; error?: string }>(
        "/tools/convert-link/lazada/sync-subid",
        {
          action,
          template: payload
        }
      );

      if (res.success) {
        onChange({ subIdSets: res.subIdSets });
        toast.success(editingSet ? "Đã cập nhật & đồng bộ Set Sub ID." : "Đã thêm & đồng bộ Set Sub ID mới.");
        setIsDialogOpen(false);
      } else {
        toast.error(res.error || "Không thể đồng bộ Sub ID với extension.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi đồng bộ Sub ID Lazada.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Đặt Set làm mặc định
  const handleSetDefault = async (set: LazadaSubIdSet) => {
    if (set.isDefault) return;
    try {
      const res = await apiPost<{ success: boolean; subIdSets: LazadaSubIdSet[]; error?: string }>(
        "/tools/convert-link/lazada/sync-subid",
        {
          action: "set-default",
          setId: set.id
        }
      );
      if (res.success) {
        onChange({ subIdSets: res.subIdSets });
        toast.success(`Đã đặt "${set.name}" làm mặc định.`);
      } else {
        toast.error(res.error || "Thao tác thất bại.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối API.");
    }
  };

  // Xóa Set Sub ID
  const handleDeleteSet = async (set: LazadaSubIdSet) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa Set Sub ID "${set.name}"? Tác vụ này sẽ xóa template tương ứng trên Lazada Adsense.`)) {
      return;
    }

    try {
      const res = await apiPost<{ success: boolean; subIdSets: LazadaSubIdSet[]; error?: string }>(
        "/tools/convert-link/lazada/sync-subid",
        {
          action: "delete",
          setId: set.id,
          template: set
        }
      );
      if (res.success) {
        onChange({ subIdSets: res.subIdSets });
        toast.success(`Đã xóa Set "${set.name}".`);
      } else {
        toast.error(res.error || "Xóa thất bại.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối API.");
    }
  };

  return (
    <>
      <PlatformAffiliateCard<LazadaMethod>
        platformName="Lazada"
        description="Convert link Lazada thông qua Extension hoặc AccessTrade. Lazada API chính thức không còn được hỗ trợ."
        accent="#1a71ff"
        enabled={config.enabled}
        status={platformStatus(config.enabled, methods)}
        defaultMethod={config.primarySource === "lazada_api" ? "web" : config.primarySource}
        methods={methods}
        isSaving={isSaving}
        onEnabledChange={(enabled) => onChange({ enabled })}
        onDefaultMethodChange={(primarySource) => {
          const fallbackSource = primarySource === "web" ? "accesstrade" : "web";
          onChange({ primarySource, fallbackSource, useFallback: true });
        }}
        onSave={onSave}
      >
        <AffiliateMethodCard
          id="lazada-web"
          title="Zerun Extension"
          description="Dùng extension đang cài trong Chrome/Edge để convert link Lazada bằng session Lazada Adsense hiện có."
          requirement="Yêu cầu: extension đã kết nối WebSocket ws://localhost:17385 và tài khoản Lazada Adsense đã đăng nhập trong browser."
          status={methods[0].status}
          expanded={expanded.web}
          disabled={!config.enabled}
          testLabel="Test Extension"
          testLoading={tests.web?.loading}
          result={tests.web?.status === "passed" ? tests.web.message ?? "Extension test thành công." : null}
          error={tests.web?.status === "failed" ? tests.web.message ?? "Extension test thất bại." : null}
          onToggle={() => setMethodExpanded("web")}
          onTest={() => onTest("web")}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Danh sách Set Sub ID Lazada</h4>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus size={16} />}
                onClick={handleAddClick}
                disabled={!config.enabled}
              >
                Thêm Set mới
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên Set</TableHead>
                    <TableHead>Sub ID 1–6</TableHead>
                    <TableHead className="w-32">Liên kết</TableHead>
                    <TableHead className="w-40 text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!config.subIdSets || config.subIdSets.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted">
                        Chưa cấu hình Set Sub ID nào. Hãy bấm "Thêm Set mới" để cấu hình.
                      </TableCell>
                    </TableRow>
                  ) : (
                    config.subIdSets.map((set) => {
                      const subIdStr = [
                        set.subId1,
                        set.subId2,
                        set.subId3,
                        set.subId4,
                        set.subId5,
                        set.subId6
                      ].filter(Boolean).join("-");

                      return (
                        <TableRow key={set.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {set.name}
                              {set.isDefault && (
                                <Badge tone="good">Mặc định</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {subIdStr ? (
                              <code className="rounded bg-[var(--color-bg-muted)] px-1.5 py-0.5 text-xs text-foreground font-mono">
                                {subIdStr}
                              </code>
                            ) : (
                              <span className="text-muted text-xs">(Không set subid)</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {set.subIdKey ? (
                              <Badge tone="good">Đã đồng bộ</Badge>
                            ) : (
                              <Badge tone="warn">Chưa đồng bộ</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              {!set.isDefault && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefault(set)}
                                  title="Đặt làm mặc định"
                                >
                                  <Check size={14} />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(set)}
                                title="Chỉnh sửa"
                              >
                                <Edit3 size={14} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10"
                                onClick={() => handleDeleteSet(set)}
                                title="Xóa"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </AffiliateMethodCard>

        <AffiliateMethodCard
          id="lazada-accesstrade"
          title="AccessTrade"
          description="Dùng AccessTrade khi muốn chuyển link Lazada qua campaign đã duyệt."
          status={methods[1].status}
          expanded={expanded.accesstrade}
          disabled={!config.enabled}
          testLabel="Test AccessTrade"
          testDisabled={!accessTradeConfigured}
          testLoading={tests.accesstrade?.loading}
          result={tests.accesstrade?.status === "passed" ? tests.accesstrade.message ?? "AccessTrade test thành công." : null}
          error={tests.accesstrade?.status === "failed" ? tests.accesstrade.message ?? "AccessTrade test thất bại." : null}
          onToggle={() => setMethodExpanded("accesstrade")}
          onTest={() => onTest("accesstrade")}
        >
          <div className="form-grid">
            <label><Label>AccessTrade Token</Label><Input type="password" value={config.accessTradeToken} onChange={(event) => onChange({ accessTradeToken: event.target.value })} disabled={!config.enabled} /></label>
            <label><Label>Campaign ID</Label><Input value={config.campaignId} onChange={(event) => onChange({ campaignId: event.target.value })} disabled={!config.enabled} /></label>
          </div>
          
          <div className="mt-4 rounded-lg border border-line bg-[var(--color-bg-muted)] p-4">
            <div className="flex gap-2">
              <AlertTriangle className="text-warning flex-shrink-0" size={18} />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Lưu ý Sub ID cho AccessTrade Lazada</p>
                <p className="text-xs text-muted">
                  Nguồn AccessTrade Lazada chỉ hỗ trợ tối đa 1 Sub ID (chính là `subId1`).
                </p>
                <p className="text-xs font-medium text-foreground">
                  Trạng thái hiện tại: {defaultSet ? (
                    <span>
                      Sử dụng `subId1` từ Set mặc định <strong>"{defaultSet.name}"</strong>:{" "}
                      <code className="rounded bg-panel px-1 py-0.5 font-mono text-xs">
                        {defaultSet.subId1 || "(trống)"}
                      </code>
                    </span>
                  ) : (
                    <span className="text-danger">Chưa có Set mặc định hoạt động.</span>
                  )}
                </p>
                {accessTradeWarning && (
                  <p className="text-xs text-warning mt-1 font-semibold">{accessTradeWarning}</p>
                )}
              </div>
            </div>
          </div>
        </AffiliateMethodCard>
      </PlatformAffiliateCard>

      {/* Modal Dialog add/edit Sub ID Set */}
      <Dialog
        open={isDialogOpen}
        onClose={() => !isSyncing && setIsDialogOpen(false)}
        title={editingSet ? "Chỉnh sửa Set Sub ID Lazada" : "Thêm Set Sub ID Lazada mới"}
      >
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="setName">Tên gợi nhớ (ví dụ: FB Seeding, Zalo Group...)</Label>
            <Input
              id="setName"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nhập tên Set gợi nhớ..."
              disabled={isSyncing}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="subId1">Sub ID 1 (Làm sạch & So khớp)</Label>
              <Input
                id="subId1"
                value={formSubId1}
                onChange={(e) => setFormSubId1(e.target.value)}
                placeholder="Ví dụ: ze"
                disabled={isSyncing}
              />
            </div>
            <div>
              <Label htmlFor="subId2">Sub ID 2</Label>
              <Input
                id="subId2"
                value={formSubId2}
                onChange={(e) => setFormSubId2(e.target.value)}
                placeholder="Ví dụ: facebook"
                disabled={isSyncing}
              />
            </div>
            <div>
              <Label htmlFor="subId3">Sub ID 3</Label>
              <Input
                id="subId3"
                value={formSubId3}
                onChange={(e) => setFormSubId3(e.target.value)}
                placeholder="Ví dụ: group1"
                disabled={isSyncing}
              />
            </div>
            <div>
              <Label htmlFor="subId4">Sub ID 4</Label>
              <Input
                id="subId4"
                value={formSubId4}
                onChange={(e) => setFormSubId4(e.target.value)}
                placeholder="Ví dụ: post2"
                disabled={isSyncing}
              />
            </div>
            <div>
              <Label htmlFor="subId5">Sub ID 5</Label>
              <Input
                id="subId5"
                value={formSubId5}
                onChange={(e) => setFormSubId5(e.target.value)}
                placeholder=""
                disabled={isSyncing}
              />
            </div>
            <div>
              <Label htmlFor="subId6">Sub ID 6</Label>
              <Input
                id="subId6"
                value={formSubId6}
                onChange={(e) => setFormSubId6(e.target.value)}
                placeholder=""
                disabled={isSyncing}
              />
            </div>
          </div>

          <div className="rounded border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-xs text-warning flex items-start gap-2">
            <AlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
            <div>
              <p className="font-semibold">Lưu ý khi đồng bộ:</p>
              <p>
                Khi bấm "Lưu & Đồng bộ", Extension sẽ thực thi gọi API Lazada để tạo/cập nhật mẫu template tương ứng. Bạn phải chắc chắn trình duyệt Chrome/Edge đang mở tài khoản Lazada Adsense để thực thi lệnh này thành công.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSyncing}
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              onClick={handleSaveSet}
              disabled={isSyncing}
              icon={isSyncing ? <Loader2 className="animate-spin" size={16} /> : undefined}
            >
              {isSyncing ? "Đang đồng bộ Lazada..." : editingSet ? "Cập nhật & Đồng bộ" : "Lưu & Đồng bộ"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
