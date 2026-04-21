import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Download,
  FileText,
  Gauge,
  History,
  MessageSquare,
  Send,
  Settings,
  Users
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const navSections = [
  {
    label: "",
    items: [{ to: "/dashboard", label: "Tổng quan", icon: Gauge }]
  },
  {
    label: "ĐĂNG BÀI",
    items: [
      { to: "/contents/new", label: "Nhập bài đăng", icon: Send },
      { to: "/contents", label: "Bài viết", icon: FileText },
      { to: "/history", label: "Lịch sử đăng", icon: History },
      { to: "/failed", label: "Bài đăng lỗi", icon: AlertTriangle },
      { to: "/pending-comments", label: "Comment chờ", icon: MessageSquare },
      { to: "/schedules", label: "Lịch đăng", icon: CalendarClock },
      { to: "/accounts", label: "Tài khoản đăng", icon: Users }
    ]
  },
  {
    label: "CRAWL",
    items: [{ to: "/crawl", label: "Nguồn crawl", icon: Download }]
  },
  {
    label: "HỆ THỐNG",
    items: [{ to: "/settings", label: "Cài đặt", icon: Settings }]
  }
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="app-shell auto-style-shell">
      <aside className="sidebar auto-style-sidebar">
        <div className="brand auto-style-brand">
          <div className="brand-mark">
            <Activity aria-hidden />
          </div>
          <div>
            <span>Zerun</span>
            <p className="text-xs text-muted m-0">Quản trị đăng bài</p>
          </div>
        </div>

        <nav className="nav-sections" aria-label="Điều hướng chính">
          {navSections.map((section, index) => (
            <div key={`${section.label}-${index}`} className="nav-section-block">
              {section.label ? <div className="nav-section-label">{section.label}</div> : null}
              <div className="nav-list">
                {section.items.map((item) => {
                  const active =
                    item.to === "/contents"
                      ? location.pathname === "/contents" || /^\/contents\/[^/]+(?:\/edit)?$/.test(location.pathname)
                      : location.pathname === item.to;

                  return (
                    <NavLink key={item.to + item.label} to={item.to} end className={`nav-item auto-style-nav ${active ? "active" : ""}`}>
                      <item.icon aria-hidden />
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
              <div className="footer-subtitle">Giao diện quản trị nội bộ</div>
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
