import { PageHeader } from "../components/common/PageHeader";
import { AccountChannelsManager } from "../components/accounts/AccountChannelsManager";

export function TargetAccountsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Kênh đích"
        subtitle="Chọn và quản lý danh sách các nhóm Zalo, kênh Telegram dùng để đăng tin. Bạn có thể thiết lập bộ lọc ngành hàng riêng cho từng kênh."
      />
      <AccountChannelsManager role="target" />
    </div>
  );
}
