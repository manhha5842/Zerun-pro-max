import { Activity, CalendarClock, FileText, Gauge, Link2, LogOut, Route, Settings, Target, Upload, UserRoundCog, Wifi, Facebook } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { apiPost } from "../api/client";
import { Button } from "./ui/Button";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/contents", label: "Nội dung", icon: FileText },
  { to: "/sources", label: "Nguồn", icon: Wifi },
  { to: "/targets", label: "Đích đăng", icon: Target },
  { to: "/routing", label: "Điều hướng", icon: Route },
  { to: "/schedules", label: "Lịch đăng", icon: CalendarClock },
  { to: "/tools/convert-link", label: "Chuyển link", icon: Link2 },
  { to: "/tools/import", label: "Import", icon: Upload },
  { to: "/accounts", label: "Tài khoản", icon: UserRoundCog },
  { to: "/facebook/campaigns", label: "FB Campaigns", icon: Facebook },
  { to: "/settings", label: "Cài đặt", icon: Settings }
];

export function Layout() {
  const navigate = useNavigate();

  async function logout() {
    await apiPost("/auth/logout", {});
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Activity aria-hidden />
          <span>Zerun</span>
        </div>
        <nav className="nav-list" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <item.icon aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" icon={<LogOut aria-hidden />} onClick={logout}>
          Đăng xuất
        </Button>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
