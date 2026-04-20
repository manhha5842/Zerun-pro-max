import {
  Activity,
  CalendarClock,
  Download,
  FileText,
  Gauge,
  Send,
  Settings,
  Users
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navSections = [
  {
    label: "",
    items: [{ to: "/dashboard", label: "Tổng quan", icon: Gauge }]
  },
  {
    label: "ĐĂNG BÀI",
    items: [
      { to: "/contents/new", label: "Nhập bài đăng", icon: Send },
      { to: "/contents", label: "Quản lý bài viết", icon: FileText },
      { to: "/schedules", label: "Lịch đăng", icon: CalendarClock },
      { to: "/accounts", label: "Tài khoản đăng bài", icon: Users }
    ]
  },
  {
    label: "CRAWL",
    items: [{ to: "/crawl", label: "Crawl data", icon: Download }]
  },
  {
    label: "HỆ THỐNG",
    items: [{ to: "/settings", label: "Cài đặt", icon: Settings }]
  }
];

export function Layout() {
  return (
    <div className="app-shell auto-style-shell">
      <aside className="sidebar auto-style-sidebar">
        <div className="brand auto-style-brand">
          <div className="brand-mark">
            <Activity aria-hidden />
          </div>
          <div>
            <span>Zerun</span>
            <p className="text-xs text-muted m-0">Admin Console</p>
          </div>
        </div>

        <nav className="nav-sections" aria-label="Điều hướng chính">
          {navSections.map((section, index) => (
            <div key={`${section.label}-${index}`} className="nav-section-block">
              {section.label ? <div className="nav-section-label">{section.label}</div> : null}
              <div className="nav-list">
                {section.items.map((item) => (
                  <NavLink key={item.to + item.label} to={item.to} className={({ isActive }) => `nav-item auto-style-nav ${isActive ? "active" : ""}`}>
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer-card">
          <div className="sidebar-footer-meta">
            <div className="footer-avatar">Z</div>
            <div>
              <div className="footer-title">Zerun</div>
              <div className="footer-subtitle">Hệ thống quản lý đăng bài</div>
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
