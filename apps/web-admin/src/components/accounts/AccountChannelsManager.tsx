import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client";
import { platformLabel, type AccountKind, type ConnectedAccount, type PlatformChannel } from "../../pages/repostTypes";
import { AdminDataTable } from "../common/AdminDataTable";
import { CategoryMultiSelect } from "../common/CategoryMultiSelect";
import { EmptyState } from "../common/EmptyState";
import { SectionCard } from "../common/SectionCard";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

type ChannelOption = {
  externalId: string;
  name: string;
  channelType: string;
  memberCount?: number;
};

function accountKey(account: ConnectedAccount) {
  return `${account.accountKind}:${account.id}`;
}

export function AccountChannelsManager({ role }: { role: AccountKind }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedAccountKey, setSelectedAccountKey] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState({
    filterMode: "all" as "all" | "category",
    acceptedCategories: [] as string[],
    allowGeneralContent: true
  });

  const accountsQuery = useQuery({
    queryKey: ["connected-accounts"],
    queryFn: () => apiGet<{ accounts: ConnectedAccount[] }>("/connected-accounts")
  });
  const channelsQuery = useQuery({
    queryKey: ["channels", role],
    queryFn: () => apiGet<{ channels: PlatformChannel[] }>(`/channels?role=${role}`)
  });

  const accounts = useMemo(() => {
    const all = accountsQuery.data?.accounts ?? [];
    return role === "source" ? all.filter((account) => account.accountKind === "source") : all;
  }, [accountsQuery.data?.accounts, role]);
  const selectedAccount = accounts.find((account) => accountKey(account) === selectedAccountKey) ?? null;
  const optionsQuery = useQuery({
    queryKey: ["channel-options", selectedAccount?.accountKind, selectedAccount?.id],
    queryFn: () => apiGet<{ channels: ChannelOption[] }>(
      `/channel-options?accountKind=${selectedAccount?.accountKind}&accountId=${selectedAccount?.id}`
    ),
    enabled: Boolean(selectedAccount),
    retry: false
  });

  const channels = channelsQuery.data?.channels ?? [];
  const existingRefs = useMemo(
    () => new Set(channels.map((channel) => `${channel.platform}:${channel.externalId}`)),
    [channels]
  );
  const availableOptions = (optionsQuery.data?.channels ?? []).filter(
    (option) => !existingRefs.has(`${selectedAccount?.platform}:${option.externalId}`)
  );

  const addChannels = useMutation({
    mutationFn: () => {
      if (!selectedAccount) throw new Error("Hãy chọn tài khoản.");
      const optionMap = new Map((optionsQuery.data?.channels ?? []).map((option) => [option.externalId, option]));
      const selected = selectedOptions.flatMap((externalId) => {
        const option = optionMap.get(externalId);
        return option ? [option] : [];
      });
      if (selected.length === 0) throw new Error("Hãy chọn ít nhất một nhóm hoặc kênh.");
      return apiPost("/channels/bulk", {
        role,
        accountKind: selectedAccount.accountKind,
        accountId: selectedAccount.id,
        channels: selected
      });
    },
    onSuccess: async () => {
      setSelectedOptions([]);
      toast.success(role === "source" ? "Đã thêm các kênh nguồn." : "Đã thêm các kênh đích.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["channels"] }),
        queryClient.invalidateQueries({ queryKey: ["connected-accounts"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  const updateChannel = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiPut(`/channels/${id}`, data),
    onSuccess: async () => {
      toast.success("Đã cập nhật kênh.");
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const removeChannel = useMutation({
    mutationFn: (id: string) => apiDelete(`/channels/${id}`),
    onSuccess: async (_, id) => {
      if (editingChannelId === id) setEditingChannelId(null);
      toast.success("Đã xóa kênh khỏi hệ thống.");
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const testCrawl = useMutation({
    mutationFn: (id: string) => apiPost<{ message: string }>(`/channels/${id}/test-crawl`, {}),
    onSuccess: async (data) => {
      toast.success(data.message ?? "Đã đưa kênh vào hàng đợi lấy tin.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["channels"] }),
        queryClient.invalidateQueries({ queryKey: ["contents"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  const editFilter = (channel: PlatformChannel) => {
    setEditingChannelId(channel.id);
    setFilterDraft({
      filterMode: channel.filterMode,
      acceptedCategories: channel.acceptedCategories ?? [],
      allowGeneralContent: channel.allowGeneralContent
    });
  };

  return (
    <SectionCard
      title={role === "source" ? "Quản lý kênh nguồn" : "Quản lý kênh đích"}
      description={role === "source"
        ? "Một tài khoản có thể cung cấp nhiều nhóm hoặc kênh. Chỉ các kênh thêm tại đây mới được dùng làm đầu vào."
        : "Dùng tài khoản đích riêng hoặc dùng lại phiên nguồn. Bộ lọc ngành hàng được cấu hình riêng cho từng kênh đích."}
      actions={
        <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => {
          void accountsQuery.refetch();
          void channelsQuery.refetch();
          if (selectedAccount) void optionsQuery.refetch();
        }}>
          Làm mới
        </Button>
      }
    >
      <div className="channel-manager-grid">
        <div className="channel-picker-panel">
          <div className="field">
            <Label>Tài khoản kết nối</Label>
            <Select
              value={selectedAccountKey}
              onChange={(event) => {
                setSelectedAccountKey(event.target.value);
                setSelectedOptions([]);
              }}
            >
              <option value="">Chọn tài khoản</option>
              {accounts.map((account) => (
                <option key={accountKey(account)} value={accountKey(account)}>
                  {account.name} · {platformLabel(account.platform)}
                </option>
              ))}
            </Select>
          </div>

          {selectedAccount ? (
            <>
              <div className="channel-picker-head">
                <div>
                  <strong>Nhóm và kênh khả dụng</strong>
                  <span>Chọn nhiều mục rồi thêm cùng lúc.</span>
                </div>
                <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => optionsQuery.refetch()}>
                  Đồng bộ
                </Button>
              </div>
              {optionsQuery.error ? <p className="field-error">{optionsQuery.error.message}</p> : null}
              <div className="channel-option-list">
                {optionsQuery.isFetching ? <span className="table-subtle">Đang tải danh sách...</span> : null}
                {!optionsQuery.isFetching && availableOptions.length === 0
                  ? <span className="table-subtle">Không còn kênh mới để thêm.</span>
                  : null}
                {availableOptions.map((option) => {
                  const checked = selectedOptions.includes(option.externalId);
                  return (
                    <label key={option.externalId} className={`channel-option-row ${checked ? "selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedOptions((current) =>
                          checked ? current.filter((id) => id !== option.externalId) : [...current, option.externalId]
                        )}
                      />
                      <span>
                        <strong>{option.name}</strong>
                        <small>
                          {option.channelType === "channel" ? "Kênh" : "Nhóm"}
                          {typeof option.memberCount === "number" ? ` · ${option.memberCount} thành viên` : ""}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <Button icon={<Plus aria-hidden />} onClick={() => addChannels.mutate()} disabled={selectedOptions.length === 0 || addChannels.isPending}>
                Thêm {selectedOptions.length || ""} kênh {role === "source" ? "nguồn" : "đích"}
              </Button>
            </>
          ) : (
            <EmptyState
              title="Chọn một tài khoản"
              description={role === "source"
                ? "App sẽ tải các nhóm/kênh mà tài khoản đang tham gia."
                : "Bạn có thể dùng lại tài khoản nguồn mà không cần đăng nhập lần nữa."}
            />
          )}
        </div>

        <div className="channel-list-panel">
          <AdminDataTable
            rows={channels}
            getRowKey={(channel) => channel.id}
            empty={<EmptyState title="Chưa có kênh" description="Chọn tài khoản và thêm các nhóm/kênh cần sử dụng." />}
            columns={[
              {
                key: "channel",
                header: role === "source" ? "Kênh nguồn" : "Kênh đích",
                render: (channel) => <div><strong>{channel.name}</strong><div className="table-subtle">{channel.externalId}</div></div>
              },
              {
                key: "account",
                header: "Tài khoản",
                render: (channel) => <div><span>{channel.account?.name ?? "Không rõ"}</span><div className="table-subtle">{platformLabel(channel.platform)}</div></div>
              },
              ...(role === "target" ? [{
                key: "filter",
                header: "Chọn lọc",
                render: (channel: PlatformChannel) => channel.filterMode === "category"
                  ? <Badge tone="warn">Theo ngành · {channel.acceptedCategories.length}</Badge>
                  : <Badge tone="good">Nhận tất cả</Badge>
              }] : []),
              {
                key: "status",
                header: role === "source" ? "Trạng thái lấy tin" : "Trạng thái",
                render: (channel) => role === "source" ? (
                  <div className="stack-tight">
                    <Badge tone={channel.isActive ? "good" : "neutral"}>{channel.isActive ? "Đang theo dõi" : "Tạm tắt"}</Badge>
                    <span className="table-subtle">
                      {channel.account?.lastCrawledAt ? `Lần lấy gần nhất: ${new Date(channel.account.lastCrawledAt).toLocaleString("vi-VN")}` : "Chưa có lần lấy tin nào"}
                    </span>
                  </div>
                ) : <Badge tone={channel.isActive ? "good" : "neutral"}>{channel.isActive ? "Đang dùng" : "Tạm tắt"}</Badge>
              },
              {
                key: "actions",
                header: "Thao tác",
                render: (channel) => (
                  <div className="row-actions">
                    {role === "target"
                      ? <Button size="sm" variant="secondary" icon={<Filter aria-hidden />} onClick={() => editFilter(channel)}>Bộ lọc</Button>
                      : null}
                    {role === "source"
                      ? <Button size="sm" variant="secondary" onClick={() => testCrawl.mutate(channel.id)} disabled={testCrawl.isPending || !channel.isActive}>Test lấy tin</Button>
                      : null}
                    <Button size="sm" variant="ghost" onClick={() => updateChannel.mutate({ id: channel.id, data: { isActive: !channel.isActive } })}>
                      {channel.isActive ? "Tắt" : "Bật"}
                    </Button>
                    <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={() => removeChannel.mutate(channel.id)}>Xóa</Button>
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      {role === "target" && editingChannelId ? (
        <div className="channel-filter-editor">
          <div className="channel-filter-editor-head">
            <div><Settings2 aria-hidden /><div><strong>Bộ lọc kênh đích</strong><span>{channels.find((channel) => channel.id === editingChannelId)?.name}</span></div></div>
            <Button variant="ghost" size="sm" onClick={() => setEditingChannelId(null)}>Đóng</Button>
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
              <span><strong>Vẫn nhận nội dung tổng quát</strong><small>Mã toàn sàn, Shopee VIP, voucher chung và deal 1k/9k được phép đi qua dù không khớp ngành.</small></span>
            </label>
            <div className="span-2 actions">
              <Button
                onClick={() => updateChannel.mutate({ id: editingChannelId, data: filterDraft })}
                disabled={filterDraft.filterMode === "category" && filterDraft.acceptedCategories.length === 0}
              >
                Lưu bộ lọc
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
