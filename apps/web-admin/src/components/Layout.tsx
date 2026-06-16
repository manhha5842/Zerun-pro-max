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
    label: "Đăng bài",
    items: [
      { to: "/contents/new", label: "Tạo bài đăng", icon: "compose" },
      { to: "/contents", label: "Quản lý bài đăng", icon: "content", match: /^\/contents$/ },
      { to: "/history", label: "Lịch sử", icon: "history" },
      { to: "/contents/archive", label: "Kho lưu trữ", icon: "archive", match: /^\/contents\/archive/ },
      { to: "/contents/trash", label: "Thùng rác", icon: "trash", match: /^\/contents\/trash/ }
    ]
  },
  {
    label: "Chuyển đổi tự động",
    items: [
      { to: "/auto-conversion/rules", label: "Cấu hình chuyển đổi", icon: "automation", match: /^\/auto-conversion\/rules/ },
      { to: "/auto-conversion/history", label: "Lịch sử chuyển đổi", icon: "history", match: /^\/auto-conversion\/history/ }
    ]
  },
  {
    label: "Crawl dữ liệu",
    items: [
      { to: "/crawl", label: "Crawl dữ liệu", icon: "crawl", match: /^\/crawl$/ },
      { to: "/crawl/history", label: "Lịch sử crawl", icon: "history", match: /^\/crawl\/history/ },
      { to: "/crawl/results", label: "Kết quả crawl", icon: "content", match: /^\/crawl\/results/ }
    ]
  },
  {
    label: "Tài khoản",
    items: [
      { to: "/accounts", label: "Tài khoản đăng", icon: "account", match: /^\/accounts/ }
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
    items: [{ to: "/tools/convert-link", label: "Convert link nhanh", icon: "tool" }]
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
