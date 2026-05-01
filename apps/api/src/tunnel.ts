import { spawn, type ChildProcess } from "node:child_process";
import type { DesktopRuntime } from "@zerun/shared";
import { logger } from "@zerun/shared";

export type TunnelController = {
  stop: () => void;
};

export function startConfiguredTunnel(runtime: DesktopRuntime): TunnelController | undefined {
  const tunnel = runtime.config.tunnel;
  if (!tunnel.enabled) return undefined;

  if (tunnel.provider !== "cloudflare") {
    logger.warn("Tunnel provider chưa được tự động hóa", { provider: tunnel.provider });
    return undefined;
  }

  const target = `http://localhost:${runtime.config.server.port}`;
  const args = tunnel.token
    ? ["tunnel", "--no-autoupdate", "run", "--token", tunnel.token]
    : ["tunnel", "--url", target];

  let child: ChildProcess | undefined;
  try {
    child = spawn("cloudflared", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    logger.warn("Không thể khởi động Cloudflare Tunnel", { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
  if (!child) return undefined;

  child.stdout?.on("data", (chunk) => logCloudflaredLine(String(chunk)));
  child.stderr?.on("data", (chunk) => logCloudflaredLine(String(chunk)));
  child.on("error", (error) => {
    logger.warn("Cloudflare Tunnel không chạy được. Hãy kiểm tra cloudflared đã được cài trên máy.", { error: error.message });
  });
  child.on("exit", (code) => {
    logger.info("Cloudflare Tunnel đã dừng", { code });
  });

  logger.info("Cloudflare Tunnel đang khởi động", { target, mode: tunnel.token ? "token" : "quick" });

  return {
    stop: () => {
      if (child && !child.killed) child.kill();
    }
  };
}

function logCloudflaredLine(line: string) {
  for (const entry of line.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const publicUrl = /https:\/\/[^\s]+trycloudflare\.com/.exec(entry)?.[0];
    if (publicUrl) {
      logger.info("Cloudflare Tunnel public URL", { publicUrl });
    } else if (/error|failed|unable/i.test(entry)) {
      logger.warn("Cloudflare Tunnel", { message: entry });
    }
  }
}
