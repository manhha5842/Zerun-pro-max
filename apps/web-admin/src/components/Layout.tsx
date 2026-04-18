import {
  Activity,
  Archive,
  CalendarClock,
  Download,
  FileText,
  Gauge,
  History,
  LogOut,
  MessageSquare,
  Send,
  Settings,
  Users,
  Facebook,
  ListOrdered,
  Sparkles
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { apiPost } from "../api/client";
import { Button } from "./ui/Button";

const navSections = [
  {
    label: "",
    items: [{ to: "/dashboard", label: "Tổng quan", icon: Gauge }]
  },
  {
    label: "CHỨC NĂNG",
    items: [
      { to: "/facebook/campaigns", label: "Đăng bài", icon: Send },
      { to: "/schedules", label: "Lên lịch", icon: CalendarClock },
      { to: "/crawl", label: "Crawl data", icon: Download }
    ]
  },
  {
    label: "QUẢN LÝ",
    items: [
      { to: "/contents", label: "Bài viết", icon: FileText },
      { to: "/accounts", label: "Tài khoản", icon: Users }
    ]
  },
  {
    label: "FACEBOOK",
    items: [
      { to: "/facebook/campaigns", label: "Campaigns", icon: Facebook },
      { to: "/schedules", label: "Bài đăng theo lịch", icon: ListOrdered }
    ]
  },
  {
    label: "HỆ THỐNG",
    items: [{ to: "/settings", label: "Cài đặt", icon: Settings }]
  }
];

export function Layout() {
  const navigate = useNavigate();

  async function logout() {
    try {
      await apiPost("/auth/logout", {});
    } finally {
      navigate("/login");
    }
  }

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
              <div className="footer-subtitle">Flow tách kiểu auto_post_agent</div>
            </div>
          </div>
          <Button variant="ghost" icon={<LogOut aria-hidden />} onClick={logout}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className="workspace auto-style-workspace">
        <Outlet />
      </main>
    </div>
  );
}
