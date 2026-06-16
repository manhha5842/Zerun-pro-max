import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiGet } from "../../api/client";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

type ZaloGroup = {
  id: string;
  name: string;
  memberCount: number;
};

export function ZaloGroupPicker({
  accountKind,
  accountId,
  value,
  onChange
}: {
  accountKind: "source" | "target";
  accountId: string | null;
  value: string;
  onChange: (threadId: string) => void;
}) {
  const query = useQuery({
    queryKey: ["zalo-groups", accountKind, accountId],
    queryFn: () => apiGet<{ groups: ZaloGroup[] }>(`/accounts/${accountKind}/${accountId}/zalo-groups`),
    enabled: false,
    retry: false
  });

  if (!accountId) {
    return <p className="field-help">Lưu tài khoản ở trạng thái Tạm tắt, quét QR tại Session đăng nhập, sau đó quay lại sửa để tải danh sách nhóm.</p>;
  }

  return (
    <div className="zalo-group-picker">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        icon={<RefreshCw aria-hidden />}
        onClick={() => query.refetch()}
        disabled={query.isFetching}
      >
        {query.isFetching ? "Đang tải nhóm..." : "Tải danh sách nhóm từ Zalo"}
      </Button>

      {query.data?.groups.length ? (
        <Select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Chọn nhóm Zalo</option>
          {query.data.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount} thành viên) - {group.id}
            </option>
          ))}
        </Select>
      ) : null}

      {query.data && query.data.groups.length === 0 ? <p className="field-help">Tài khoản Zalo này chưa tham gia nhóm nào.</p> : null}
      {query.error ? <p className="field-error">{query.error.message}. Hãy quét QR và kiểm tra session trước.</p> : null}
    </div>
  );
}
