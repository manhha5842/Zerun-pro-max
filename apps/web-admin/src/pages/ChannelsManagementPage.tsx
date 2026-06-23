import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Filter, Plus, RefreshCw, Settings2, TestTube2, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { AdminDataTable } from "../components/common/AdminDataTable";
import { CategoryMultiSelect } from "../components/common/CategoryMultiSelect";
import { EmptyState } from "../components/common/EmptyState";
import { FilterToolbar } from "../components/common/FilterToolbar";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";
import { formatDateTime, platformLabel, type AccountKind, type ConnectedAccount, type PlatformChannel, type RepostAccount } from "./repostTypes";

type ChannelTab = "all" | "source" | "target" | "session_issue";

type ChannelOption = {
  externalId: string;
  name: string;
  channelType: string;
  memberCount?: number;
};

type UnifiedChannel = PlatformChannel & {
  role: AccountKind;
};

type LoginAccount = ConnectedAccount & {
  loginAccountKey: string;
  roleAccounts: Partial<Record<AccountKind, ConnectedAccount>>;
};

type ChannelWizard = {
  role: AccountKind;
  platform: string;
  loginAccountKey: string;
  selectedOptions: string[];
};

function accountKey(account: ConnectedAccount) {
  return `${account.accountKind}:${account.id}`;
}

function toLoginAccountKey(account: ConnectedAccount) {
  const identity = (account.handle ?? account.name).trim().toLowerCase();
  return `${account.platform}:${identity || account.id}`;
}

function splitAccountKey(value: string) {
  const [accountKind, id] = value.split(":");
  return { kind: accountKind as AccountKind, id };
}

function roleLabel(role: AccountKind) {
  return role === "source" ? "Nguồn" : "Đích";
}

function sessionTone(account?: ConnectedAccount | null): "neutral" | "good" | "warn" | "danger" {
  if (!account) return "danger";
  if (account.health === "healthy") return "good";
  if (account.health === "failed") return "danger";
  return "warn";
}

const initialWizard: ChannelWizard = {
  role: "source",
  platform: "",
  loginAccountKey: "",
  selectedOptions: []
};

const defaultPlatforms = ["zalo-personal", "telegram"];

function toConnectedAccount(account: RepostAccount, accountKind: AccountKind): ConnectedAccount {
  return {
    id: account.id,
    accountKind,
    platform: account.platform,
    name: account.name,
    handle: account.handle,
    health: account.health,
    isActive: account.isActive,
    lastCrawledAt: "lastCrawledAt" in account ? account.lastCrawledAt as string | null : null
  };
}

export function ChannelsManagementPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<ChannelTab>("all");
  const [keyword, setKeyword] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [wizard, setWizard] = useState<ChannelWizard>(initialWizard);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState({
    filterMode: "all" as "all" | "category",
    acceptedCategories: [] as string[],
    allowGeneralContent: true
  });

  const accountsQuery = useQuery({
    queryKey: ["connected-accounts"],
    queryFn: () => apiGet<{ accounts: ConnectedAccount[] }>("/connected-accounts")
  });
  const sourceAccountsQuery = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<{ sources: RepostAccount[] }>("/sources"),
    retry: false
  });
  const targetAccountsQuery = useQuery({
    queryKey: ["targets"],
    queryFn: () => apiGet<{ targets: RepostAccount[] }>("/targets"),
    retry: false
  });
  const sourceChannelsQuery = useQuery({
    queryKey: ["channels", "source"],
    queryFn: () => apiGet<{ channels: PlatformChannel[] }>("/channels?role=source")
  });
  const targetChannelsQuery = useQuery({
    queryKey: ["channels", "target"],
    queryFn: () => apiGet<{ channels: PlatformChannel[] }>("/channels?role=target")
  });

  const accounts = useMemo(() => {
    const connected = accountsQuery.data?.accounts ?? [];
    const fallbackSources = (sourceAccountsQuery.data?.sources ?? []).map((account) => toConnectedAccount(account, "source"));
    const fallbackTargets = (targetAccountsQuery.data?.targets ?? []).map((account) => toConnectedAccount(account, "target"));
    const merged = [...connected, ...fallbackSources, ...fallbackTargets];
    const seen = new Set<string>();
    return merged.filter((account) => {
      const key = accountKey(account);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [accountsQuery.data?.accounts, sourceAccountsQuery.data?.sources, targetAccountsQuery.data?.targets]);

  const loginAccounts = useMemo<LoginAccount[]>(() => {
    const byLogin = new Map<string, LoginAccount>();
    for (const account of accounts) {
      const loginAccountKey = toLoginAccountKey(account);
      const current = byLogin.get(loginAccountKey);
      if (!current) {
        byLogin.set(loginAccountKey, {
          ...account,
          loginAccountKey,
          roleAccounts: { [account.accountKind]: account }
        });
        continue;
      }
      current.roleAccounts[account.accountKind] = account;
      if (current.health !== "healthy" && account.health === "healthy") {
        Object.assign(current, account, { loginAccountKey, roleAccounts: current.roleAccounts });
      }
    }
    return Array.from(byLogin.values());
  }, [accounts]);

  const accountByKey = useMemo(() => new Map(accounts.map((account) => [accountKey(account), account])), [accounts]);
  const platforms = useMemo(
    () => Array.from(new Set([...defaultPlatforms, ...loginAccounts.map((account) => account.platform)])).sort(),
    [loginAccounts]
  );
  const eligibleAccounts = useMemo(() => {
    return loginAccounts.filter((account) => {
      if (wizard.platform && account.platform !== wizard.platform) return false;
      return true;
    });
  }, [loginAccounts, wizard.platform]);
  const selectedLoginAccount = eligibleAccounts.find((account) => account.loginAccountKey === wizard.loginAccountKey) ?? null;
  const selectedAccount = selectedLoginAccount
    ? selectedLoginAccount.roleAccounts[wizard.role] ?? selectedLoginAccount.roleAccounts.source ?? selectedLoginAccount.roleAccounts.target ?? selectedLoginAccount
    : null;

  const optionsQuery = useQuery({
    queryKey: ["channel-options", selectedAccount?.accountKind, selectedAccount?.id],
    queryFn: () => apiGet<{ channels: ChannelOption[] }>(
      `/channel-options?accountKind=${selectedAccount?.accountKind}&accountId=${selectedAccount?.id}`
    ),
    enabled: Boolean(selectedAccount),
    retry: false
  });

  const channels = useMemo<UnifiedChannel[]>(() => [
    ...((sourceChannelsQuery.data?.channels ?? []).map((channel) => ({ ...channel, account: channel.account ?? accountByKey.get(`${channel.accountKind}:${channel.accountId}`) ?? null, role: "source" as const }))),
    ...((targetChannelsQuery.data?.channels ?? []).map((channel) => ({ ...channel, account: channel.account ?? accountByKey.get(`${channel.accountKind}:${channel.accountId}`) ?? null, role: "target" as const })))
  ], [accountByKey, sourceChannelsQuery.data?.channels, targetChannelsQuery.data?.channels]);

  const visibleChannels = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return channels.filter((channel) => {
      if (tab === "source" && channel.role !== "source") return false;
      if (tab === "target" && channel.role !== "target") return false;
      if (tab === "session_issue" && channel.account?.health !== "failed") return false;
      if (!normalizedKeyword) return true;
      return [
        channel.name,
        channel.externalId,
        channel.platform,
        channel.account?.name,
        channel.account?.handle,
        channel.account?.health
      ].join(" ").toLowerCase().includes(normalizedKeyword);
    });
  }, [channels, keyword, tab]);

  const existingRefs = useMemo(
    () => new Set(channels.map((channel) => `${channel.platform}:${channel.externalId}:${channel.role}`)),
    [channels]
  );
  const availableOptions = (optionsQuery.data?.channels ?? []).filter(
    (option) => selectedAccount && !existingRefs.has(`${selectedAccount.platform}:${option.externalId}:${wizard.role}`)
  );

  const invalidateChannels = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["channels"] }),
    queryClient.invalidateQueries({ queryKey: ["connected-accounts"] })
  ]);

  const addChannels = useMutation({
    mutationFn: () => {
      if (!selectedAccount) throw new Error("Hãy chọn tài khoản đăng nhập.");
      const optionMap = new Map((optionsQuery.data?.channels ?? []).map((option) => [option.externalId, option]));
      const selected = wizard.selectedOptions.flatMap((externalId) => {
        const option = optionMap.get(externalId);
        return option ? [option] : [];
      });
      if (selected.length === 0) throw new Error("Hãy chọn ít nhất một kênh.");
      return apiPost("/channels/bulk", {
        role: wizard.role,
        accountKind: selectedAccount.accountKind,
        accountId: selectedAccount.id,
        channels: selected
      });
    },
    onSuccess: async () => {
      toast.success("Đã thêm kênh.");
      setWizard((current) => ({ ...current, selectedOptions: [] }));
      await invalidateChannels();
    },
    onError: (error) => toast.error(error.message)
  });

  const updateChannel = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiPut(`/channels/${id}`, data),
    onSuccess: async () => {
      toast.success("Đã cập nhật kênh.");
      await invalidateChannels();
    },
    onError: (error) => toast.error(error.message)
  });

  const removeChannel = useMutation({
    mutationFn: (id: string) => apiDelete(`/channels/${id}`),
    onSuccess: async () => {
      toast.success("Đã xóa kênh.");
      await invalidateChannels();
    },
    onError: (error) => toast.error(error.message)
  });

  const testCrawl = useMutation({
    mutationFn: (id: string) => apiPost<{ message: string }>(`/channels/${id}/test-crawl`, {}),
    onSuccess: (data) => toast.success(data.message ?? "Đã tạo job lấy tin. Xem tiến độ ở Worker jobs / Logs, queue Crawl."),
    onError: (error) => toast.error(error.message)
  });

  const checkSession = useMutation({
    mutationFn: ({ kind, id }: { kind: AccountKind; id: string }) => apiGet(`/accounts/${kind}/${id}/session`),
    onSuccess: () => toast.success("Đã kiểm tra session tài khoản."),
    onError: (error) => toast.error(error.message)
  });

  const editTargetFilter = (channel: UnifiedChannel) => {
    setEditingTargetId(channel.id);
    setFilterDraft({
      filterMode: channel.filterMode,
      acceptedCategories: channel.acceptedCategories ?? [],
      allowGeneralContent: channel.allowGeneralContent
    });
  };

  const selectedOptionCount = wizard.selectedOptions.length;
  const totalSessionIssues = channels.filter((channel) => channel.account?.health === "failed").length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Quản lý kênh"
        subtitle="Nguồn và đích là role của cùng một hệ kênh. Một tài khoản có thể cấp nhiều kênh, mỗi kênh được bật/tắt và kiểm tra session riêng."
        actions={<><Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => {
          void accountsQuery.refetch();
          void sourceAccountsQuery.refetch();
          void targetAccountsQuery.refetch();
          void sourceChannelsQuery.refetch();
          void targetChannelsQuery.refetch();
        }}>Làm mới</Button><Button icon={<Plus aria-hidden />} onClick={() => setShowWizard((value) => !value)}>Thêm kênh</Button></>}
      />

      {showWizard ? (
        <SectionCard title="Thêm kênh" description="Chọn role, nền tảng và tài khoản để tải danh sách nhóm/kênh có thể thêm.">
          <div className="channel-wizard-grid">
            <div className="choice-grid">
              {(["source", "target"] as AccountKind[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`choice-card ${wizard.role === role ? "active" : ""}`}
                  onClick={() => setWizard((current) => ({ ...current, role, selectedOptions: [] }))}
                >
                  <span className="choice-title">{roleLabel(role)}</span>
                  <span>{role === "source" ? "Kênh để Zerun lấy nội dung." : "Kênh để Zerun đăng nội dung đã duyệt."}</span>
                </button>
              ))}
            </div>

            <div className="form-grid">
              <label>
                <Label>Nền tảng</Label>
                <Select value={wizard.platform} onChange={(event) => setWizard((current) => ({ ...current, platform: event.target.value, loginAccountKey: "", selectedOptions: [] }))}>
                  <option value="">Tất cả nền tảng</option>
                  {platforms.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
                </Select>
              </label>
              <label>
                <Label>Tài khoản đăng nhập</Label>
                <Select value={wizard.loginAccountKey} onChange={(event) => setWizard((current) => ({ ...current, loginAccountKey: event.target.value, selectedOptions: [] }))}>
                  <option value="">Chọn tài khoản</option>
                  {eligibleAccounts.map((account) => (
                    <option key={account.loginAccountKey} value={account.loginAccountKey}>
                      {account.name} · {platformLabel(account.platform)}{account.isActive ? "" : " · tạm tắt"}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="channel-option-list unified-channel-options">
              {!selectedAccount ? <EmptyState title="Chọn tài khoản để tải kênh" description="Zerun sẽ lấy danh sách nhóm/kênh khả dụng từ phiên đã đăng nhập." /> : null}
              {selectedAccount && optionsQuery.isFetching ? <span className="table-subtle">Đang tải danh sách kênh...</span> : null}
              {selectedAccount && optionsQuery.error ? <p className="field-error">{optionsQuery.error.message}</p> : null}
              {selectedAccount && !optionsQuery.isFetching && !optionsQuery.error && availableOptions.length === 0 ? <span className="table-subtle">Không còn kênh mới để thêm cho role này.</span> : null}
              {availableOptions.map((option) => {
                const checked = wizard.selectedOptions.includes(option.externalId);
                return (
                  <label key={option.externalId} className={`channel-option-row ${checked ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setWizard((current) => ({
                        ...current,
                        selectedOptions: checked
                          ? current.selectedOptions.filter((id) => id !== option.externalId)
                          : [...current.selectedOptions, option.externalId]
                      }))}
                    />
                    <span>
                      <strong>{option.name}</strong>
                      <small>{option.channelType === "channel" ? "Kênh" : "Nhóm"}{typeof option.memberCount === "number" ? ` · ${option.memberCount} thành viên` : ""}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="actions">
              <Button icon={<CheckCircle2 aria-hidden />} onClick={() => addChannels.mutate()} disabled={!selectedAccount || selectedOptionCount === 0 || addChannels.isPending}>
                Thêm {selectedOptionCount || ""} kênh
              </Button>
              <Button variant="ghost" onClick={() => setShowWizard(false)}>Đóng</Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Danh sách kênh"
        description="Một bảng chung cho nguồn và đích; dùng filter để xem đúng role cần thao tác."
      >
        <div className="channel-tabs">
          {[
            { id: "all", label: "Tất cả", count: channels.length },
            { id: "source", label: "Nguồn lấy nội dung", count: channels.filter((channel) => channel.role === "source").length },
            { id: "target", label: "Đích đăng", count: channels.filter((channel) => channel.role === "target").length },
            { id: "session_issue", label: "Có lỗi session", count: totalSessionIssues }
          ].map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id as ChannelTab)}>
              {item.label}<Badge tone={item.count > 0 ? "neutral" : "neutral"}>{item.count}</Badge>
            </button>
          ))}
        </div>

        <FilterToolbar>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên kênh, nền tảng, tài khoản, handle/URL..." />
        </FilterToolbar>

        <AdminDataTable
          rows={visibleChannels}
          getRowKey={(row) => `${row.role}:${row.id}`}
          empty={<EmptyState title="Chưa có kênh phù hợp" description="Bấm Thêm kênh để chọn nguồn lấy nội dung hoặc đích đăng." />}
          columns={[
            {
              key: "channel",
              header: "Kênh/account",
              render: (row) => <div className="stack-tight"><strong>{row.name}</strong><span className="table-subtle">{row.account?.name ?? "Chưa rõ tài khoản"}</span></div>
            },
            { key: "platform", header: "Platform", render: (row) => platformLabel(row.platform) },
            { key: "role", header: "Role", render: (row) => <Badge tone={row.role === "source" ? "warn" : "good"}>{roleLabel(row.role)}</Badge> },
            { key: "handle", header: "Handle/URL", render: (row) => <span className="table-subtle">{row.externalId}</span> },
            { key: "active", header: "Active", render: (row) => <Badge tone={row.isActive ? "good" : "neutral"}>{row.isActive ? "Đang bật" : "Tạm tắt"}</Badge> },
            {
              key: "health",
              header: "Health",
              render: (row) => <Badge tone={sessionTone(row.account)}>{row.account?.health ?? "unknown"}</Badge>
            },
            {
              key: "session",
              header: "Session/Auth",
              render: (row) => <span className="table-subtle">{row.account?.lastCrawledAt ? `Cập nhật gần nhất: ${formatDateTime(row.account.lastCrawledAt)}` : "Chưa có dữ liệu phiên gần đây"}</span>
            },
            {
              key: "actions",
              header: "Actions",
              render: (row) => {
                const account = row.account;
                const accountInfo = account ? splitAccountKey(accountKey(account)) : null;
                return (
                  <div className="row-actions">
                    {row.role === "source" ? (
                      <Button size="sm" variant="secondary" icon={<TestTube2 aria-hidden />} onClick={() => testCrawl.mutate(row.id)} disabled={testCrawl.isPending || !row.isActive}>
                        Kiểm tra
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RefreshCw aria-hidden />}
                      onClick={() => accountInfo && checkSession.mutate(accountInfo)}
                      disabled={!accountInfo || checkSession.isPending}
                    >
                      Check session
                    </Button>
                    {row.role === "target" ? (
                      <Button size="sm" variant="secondary" icon={<Filter aria-hidden />} onClick={() => editTargetFilter(row)}>
                        Edit
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => updateChannel.mutate({ id: row.id, data: { isActive: !row.isActive } })}>
                      {row.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={() => removeChannel.mutate(row.id)}>
                      Delete
                    </Button>
                  </div>
                );
              }
            }
          ]}
        />
      </SectionCard>

      {editingTargetId ? (
        <SectionCard
          title="Bộ lọc đích đăng"
          description={channels.find((channel) => channel.id === editingTargetId)?.name}
          actions={<Button variant="ghost" size="sm" onClick={() => setEditingTargetId(null)}>Đóng</Button>}
        >
          <div className="channel-filter-editor-head">
            <div><Settings2 aria-hidden /><div><strong>Routing cho kênh đích</strong><span>Giữ cấu hình này riêng cho từng đích đăng.</span></div></div>
          </div>
          <div className="form-grid">
            <label className="span-2">
              <Label>Chế độ nhận nội dung</Label>
              <Select value={filterDraft.filterMode} onChange={(event) => setFilterDraft((current) => ({ ...current, filterMode: event.target.value as "all" | "category" }))}>
                <option value="all">Nhận tất cả nội dung từ luồng</option>
                <option value="category">Chỉ nhận ngành hàng đã chọn</option>
              </Select>
            </label>
            {filterDraft.filterMode === "category" ? (
              <div className="span-2 field">
                <Label>Ngành hàng phù hợp với kênh</Label>
                <CategoryMultiSelect
                  value={filterDraft.acceptedCategories}
                  onChange={(acceptedCategories) => setFilterDraft((current) => ({ ...current, acceptedCategories }))}
                  emptyLabel="Hãy chọn ít nhất một ngành"
                />
              </div>
            ) : null}
            <label className="span-2 checkbox-field">
              <input type="checkbox" checked={filterDraft.allowGeneralContent} onChange={(event) => setFilterDraft((current) => ({ ...current, allowGeneralContent: event.target.checked }))} />
              <span><strong>Vẫn nhận nội dung tổng quát</strong><small>Mã toàn sàn, voucher chung và deal tổng hợp được phép đi qua dù không khớp ngành.</small></span>
            </label>
            <div className="span-2 actions">
              <Button
                onClick={() => editingTargetId && updateChannel.mutate({ id: editingTargetId, data: filterDraft })}
                disabled={filterDraft.filterMode === "category" && filterDraft.acceptedCategories.length === 0}
              >
                Lưu bộ lọc
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
