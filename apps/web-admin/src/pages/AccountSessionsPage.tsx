import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, Square, Trash2 } from "lucide-react";
import { apiAssetUrl, apiDelete, apiGet, apiPost } from "../api/client";
import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";
import { SetupGuide } from "../components/common/SetupGuide";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { platformLabel } from "./repostTypes";

type Session = {
  id: string;
  platform: string;
  accountKind: "source" | "target";
  accountId: string;
  status: string;
  updatedAt: string;
  data?: {
    qrReady?: boolean;
    qrUpdatedAt?: string | null;
    error?: string;
  } | null;
};

type Account = {
  id: string;
  kind: "source" | "target";
  name: string;
  platform: string;
  health: string;
  isActive: boolean;
};

function sessionTone(status: string): "good" | "warn" | "danger" | "neutral" {
  if (status === "login_ok" || status === "headless_running") return "good";
  if (status === "open_for_login" || status === "created" || status === "unknown") return "warn";
  if (status === "login_failed" || status === "failed" || status === "deleted") return "danger";
  return "neutral";
}

function sessionLabel(status: string) {
  const labels: Record<string, string> = {
    unknown: "Chưa có session",
    created: "Đã tạo, chưa đăng nhập",
    open_for_login: "Đang chờ quét QR",
    login_ok: "Đã đăng nhập",
    login_failed: "Đăng nhập thất bại",
    stopped: "Đã dừng",
    deleted: "Đã xóa"
  };
  return labels[status] ?? status;
}

function ZaloSessionPanel({ account }: { account: Account }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const basePath = `/accounts/${account.kind}/${account.id}/session`;
  const queryKey = ["account-session", account.kind, account.id];
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [qrTimestamp, setQrTimestamp] = useState(() => Date.now());

  const sessionQuery = useQuery({
    queryKey,
    queryFn: () => apiGet<{ session: Session | null }>(basePath),
    refetchInterval: false
  });

  const session = sessionQuery.data?.session;
  const isLoggingIn = session?.status === "open_for_login";
  const qrReady = session?.data?.qrReady === true;

  useEffect(() => {
    if (!isLoggingIn) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey });
      setQrTimestamp(Date.now());
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLoggingIn, queryClient, queryKey]);

  const createSession = useMutation({
    mutationFn: () => apiPost(`${basePath}/create`, {}),
    onSuccess: () => {
      toast.success("Đã tạo session.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message)
  });

  const qrLogin = useMutation({
    mutationFn: () => apiPost(`${basePath}/zalo-qr`, {}),
    onSuccess: () => {
      toast.success("QR đang được tạo. Hãy quét bằng ứng dụng Zalo.");
      void queryClient.invalidateQueries({ queryKey });
      setQrTimestamp(Date.now());
    },
    onError: (error) => toast.error(error.message)
  });

  const stopSession = useMutation({
    mutationFn: () => apiPost(`${basePath}/stop`, {}),
    onSuccess: () => {
      toast.success("Đã dừng session.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteSession = useMutation({
    mutationFn: () => apiDelete(basePath),
    onSuccess: () => {
      toast.success("Đã xóa session.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message)
  });

  const qrUrl = apiAssetUrl(`/accounts/${account.kind}/${account.id}/session/qr.png?t=${qrTimestamp}`);

  return (
    <div className="session-card">
      <div className="session-card-head">
        <div>
          <strong>{account.name}</strong>
          <div className="table-subtle">
            {account.kind === "source" ? "Nguồn" : "Đích"} · {platformLabel(account.platform)} · Health {account.health}
          </div>
        </div>
        <Badge tone={sessionTone(session?.status ?? "unknown")}>{sessionLabel(session?.status ?? "unknown")}</Badge>
      </div>

      {isLoggingIn ? (
        <div className="qr-login-box">
          <p>Quét QR bằng ứng dụng Zalo để đăng nhập. Trang sẽ tự làm mới trạng thái mỗi 3 giây.</p>
          {qrReady ? (
            <img src={qrUrl} alt={`Mã QR đăng nhập Zalo cho ${account.name}`} />
          ) : (
            <div className="qr-placeholder">
              <QrCode size={54} aria-hidden />
              <span>Đang tạo mã QR...</span>
            </div>
          )}
          {session?.data?.error ? <p className="field-error">{session.data.error}</p> : null}
          <small>Trong Zalo điện thoại: mở biểu tượng QR ở thanh tìm kiếm, quét mã và xác nhận đăng nhập.</small>
        </div>
      ) : null}

      <div className="row-actions">
        <Button size="sm" variant="secondary" onClick={() => createSession.mutate()} disabled={createSession.isPending}>
          1. Tạo session
        </Button>
        <Button size="sm" icon={<QrCode aria-hidden />} onClick={() => qrLogin.mutate()} disabled={qrLogin.isPending}>
          2. QR login
        </Button>
        <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => void queryClient.invalidateQueries({ queryKey })} disabled={sessionQuery.isFetching}>
          3. Kiểm tra
        </Button>
        <Button size="sm" variant="secondary" icon={<Square aria-hidden />} onClick={() => stopSession.mutate()} disabled={stopSession.isPending}>
          4. Dừng
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={() => deleteSession.mutate()} disabled={deleteSession.isPending}>
          5. Xóa
        </Button>
      </div>

      <p className="field-help">
        Sau khi trạng thái là Đã đăng nhập, quay lại trang {account.kind === "source" ? "Tài khoản nguồn" : "Tài khoản đích"} và dùng khu Quản lý kênh để đồng bộ/chọn nhiều nhóm.
      </p>
      {session?.updatedAt ? <div className="table-subtle">Cập nhật: {new Date(session.updatedAt).toLocaleString("vi-VN")}</div> : null}
    </div>
  );
}

export function AccountSessionsPage() {
  const accountsQuery = useQuery({
    queryKey: ["accounts", "sessions-page"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/accounts")
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const zaloSources = accounts.filter((account) => account.kind === "source" && account.platform === "zalo-personal");
  const zaloTargets = accounts.filter((account) => account.kind === "target" && account.platform === "zalo-personal");
  const telegramAccounts = accounts.filter((account) => account.platform === "telegram");

  return (
    <div className="page-stack">
      <PageHeader
        title="Sửa session Zalo"
        subtitle="QR chính đã nằm trong wizard Tài khoản nguồn/đích. Trang này chỉ dùng để đăng nhập lại, dừng hoặc xóa session Zalo khi cần xử lý sự cố."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden />} onClick={() => accountsQuery.refetch()} disabled={accountsQuery.isFetching}>
            Làm mới tài khoản
          </Button>
        }
      />

      <SectionCard title="Khi nào dùng trang này">
        <SetupGuide
          steps={[
            {
              title: "Tài khoản đã được tạo từ wizard",
              status: "ready",
              description: "Luồng chuẩn là tạo account, quét QR rồi chọn nhiều nhóm ở khu Quản lý kênh của trang Tài khoản nguồn hoặc Tài khoản đích.",
              verification: "Account đã có tên, đúng loại Nguồn/Đích và được giữ Tạm tắt nếu setup chưa hoàn tất."
            },
            {
              title: "Đăng nhập lại khi session lỗi",
              status: "manual",
              description: "Tìm đúng account bên dưới, bấm Tạo session rồi QR login. Quét bằng ứng dụng Zalo, không dùng camera thường.",
              verification: "Badge chuyển sang Đã đăng nhập."
            },
            {
              title: "Quay lại quản lý kênh để chọn nhóm",
              status: "ready",
              description: "Sau khi đăng nhập lại, mở trang Nguồn/Đích, chọn account trong khu Quản lý kênh rồi đồng bộ danh sách nhóm.",
              verification: "Các nhóm cần đọc hoặc đăng xuất hiện trong danh sách kênh nguồn/kênh đích."
            },
            {
              title: "Chỉ xóa session khi muốn kết nối lại từ đầu",
              status: "pending",
              description: "Dừng chỉ ngắt phiên hiện tại. Xóa sẽ bỏ profile đăng nhập và yêu cầu quét QR lại.",
              verification: "Sau khi xử lý, kiểm tra Health tại trang tài khoản trước khi bật."
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Zalo cá nhân - tài khoản nguồn">
        {zaloSources.length === 0 ? (
          <p className="table-subtle">Chưa có tài khoản Zalo nguồn. Hãy tạo ở trang Tài khoản nguồn với nền tảng Zalo cá nhân và trạng thái Tạm tắt.</p>
        ) : (
          <div className="session-card-list">
            {zaloSources.map((account) => <ZaloSessionPanel key={`source-${account.id}`} account={account} />)}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Zalo cá nhân - tài khoản đích">
        {zaloTargets.length === 0 ? (
          <p className="table-subtle">Chưa có tài khoản Zalo đích. Hãy tạo ở trang Tài khoản đích với nền tảng Zalo cá nhân và trạng thái Tạm tắt.</p>
        ) : (
          <div className="session-card-list">
            {zaloTargets.map((account) => <ZaloSessionPanel key={`target-${account.id}`} account={account} />)}
          </div>
        )}
      </SectionCard>

      {telegramAccounts.length > 0 ? (
        <SectionCard title="Telegram">
          <SetupGuide
            steps={[
              {
                title: "Telegram được kết nối ngay trong wizard tài khoản",
                status: "ready",
                description: "Vào Tài khoản nguồn hoặc Tài khoản đích, nhập API ID, API Hash và số điện thoại. App sẽ yêu cầu OTP, hỏi mật khẩu 2FA nếu tài khoản có bật, rồi tự lưu phiên đăng nhập.",
                verification: "Sau khi đăng nhập thành công, wizard phải tải được danh sách nhóm/kênh và Health chuyển thành healthy."
              }
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
