import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type ZerunIconName } from "./ui/Icon";

type NavSection = {
  label: string;
  items: Array<{
    to: string;
    label: string;
    icon: ZerunIconName;
    match?: RegExp;
  }>;
};

const navSections: NavSection[] = [
  {
    label: "Tổng quan",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { to: "/worker-jobs", label: "Worker jobs / Logs", icon: "activity" }
    ]
  },
  {
    label: "Đăng lại",
    items: [
      { to: "/repost/flow", label: "Luồng đăng lại", icon: "automation", match: /^\/repost\/flow/ },
      { to: "/repost/review", label: "Hàng chờ duyệt", icon: "content", match: /^\/repost\/review/ },
      { to: "/repost/manual-links", label: "Link lỗi cần xử lý", icon: "tool", match: /^\/repost\/manual-links/ },
      { to: "/repost/history", label: "Lịch sử đăng lại", icon: "history", match: /^\/repost\/history/ }
    ]
  },
  {
    label: "Tài khoản & Kênh",
    items: [
      { to: "/accounts", label: "Quản lý tài khoản", icon: "account", match: /^\/accounts$/ },
      { to: "/accounts/sources", label: "Kênh nguồn", icon: "automation", match: /^\/accounts\/sources/ },
      { to: "/accounts/targets", label: "Kênh đích", icon: "automation", match: /^\/accounts\/targets/ }
    ]
  },
  {
    label: "Cài đặt",
    items: [
      { to: "/settings/ai", label: "AI", icon: "settings", match: /^\/settings\/ai/ },
      { to: "/settings/affiliate", label: "Affiliate", icon: "settings", match: /^\/settings\/affiliate/ },
      { to: "/settings/telegram-alert", label: "Cảnh báo Telegram", icon: "settings", match: /^\/settings\/telegram-alert/ },
      { to: "/settings/auto-publish", label: "Auto-publish", icon: "settings", match: /^\/settings\/auto-publish/ }
    ]
  },
  {
    label: "Công cụ",
    items: [{ to: "/tools/convert-link", label: "Convert link affiliate", icon: "tool" }]
  }
];

export function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell auto-style-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar auto-style-sidebar">
        <div className="brand auto-style-brand">
          <div className="brand-mark">
            <Icon name="activity" size={18} weight="fill" tone="default" />
          </div>
          <div>
            <span>Zerun</span>
            <p className="text-xs text-muted m-0">Đăng lại theo ngành</p>
          </div>
          <button
            type="button"
            className="sidebar-collapse-button"
            aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="nav-sections" aria-label="Điều hướng chính">
          {navSections.map((section) => (
            <div key={section.label} className="nav-section-block">
              <div className="nav-section-label">{section.label}</div>
              <div className="nav-list">
                {section.items.map((item) => {
                  const active = item.match ? item.match.test(location.pathname) : location.pathname === item.to;
                  return (
                    <NavLink key={item.to} to={item.to} end className={`nav-item auto-style-nav ${active ? "active" : ""}`}>
                      <Icon name={item.icon} size={18} weight={active ? "fill" : "regular"} tone="default" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer-card">
          <div className="sidebar-footer-meta">
            <div className="footer-avatar">Z</div>
            <div>
              <div className="footer-title">Zerun</div>
              <div className="footer-subtitle">Routing AI theo ngành hàng</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="workspace auto-style-workspace">
        <Outlet />
      </main>
    </div>
  );
}
