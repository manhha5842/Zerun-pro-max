import { PageHeader } from "../components/common/PageHeader";
import { AccountChannelsManager } from "../components/accounts/AccountChannelsManager";

export function SourceAccountsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Kênh nguồn"
        subtitle="Chọn và quản lý danh sách các nhóm Zalo, kênh Telegram dùng để theo dõi và lấy tin đầu vào."
      />
      <AccountChannelsManager role="source" />
    </div>
  );
}
