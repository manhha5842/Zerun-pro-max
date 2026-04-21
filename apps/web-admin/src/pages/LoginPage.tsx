import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { apiPost } from "../api/client";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiPost("/auth/login", {
        username: form.get("username"),
        password: form.get("password")
      });
      navigate("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Đăng nhập thất bại");
    }
  }

  return (
    <main className="login-screen">
      <form className="panel panel-pad login-panel" onSubmit={submit}>
        <h1 className="page-title">Zerun</h1>
        <p className="page-subtitle">Đăng nhập để vận hành crawl, chuyển link và đăng bài đa nền tảng.</p>
        <div className="form-grid" style={{ marginTop: 22 }}>
          <label className="field full">
            <span>Tên đăng nhập</span>
            <input name="username" autoComplete="username" required defaultValue="admin" />
          </label>
          <label className="field full">
            <span>Mật khẩu</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </div>
        {error ? <p className="text-danger">{error}</p> : null}
        <div className="actions" style={{ marginTop: 18 }}>
          <Button icon={<LogIn aria-hidden />}>Đăng nhập</Button>
        </div>
      </form>
    </main>
  );
}
