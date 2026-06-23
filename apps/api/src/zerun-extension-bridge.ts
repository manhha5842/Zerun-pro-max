import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { logger } from "@zerun/shared";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("ws") as { WebSocketServer: any };

export type ExtensionConvertInput = {
  url: string;
  subIds?: string[];
  subId?: string;
  outputType?: "shortlink" | "full";
  lazadaSubIdSet?: any;
};

export type ExtensionConvertResult = {
  status: "DONE" | "FAILED" | "NEED_LOGIN" | "NEED_MANUAL_VERIFY" | "TIMEOUT";
  sourceUrl: string;
  shortLink?: string | null;
  longLink?: string | null;
  rawLongLink?: string | null;
  convertedUrl?: string | null;
  failCode?: string | null;
  errorCode?: string | null;
  message?: string | null;
  via?: string | null;
  meta?: unknown;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  taskId: string;
};

type ExtensionSocket = {
  readyState: number;
  isAlive?: boolean;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
  terminate?: () => void;
  ping?: () => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

function normalizeSubIds(input: ExtensionConvertInput) {
  const fromArray = Array.isArray(input.subIds) ? input.subIds : [];
  const values = [input.subId ?? fromArray[0] ?? "", fromArray[1] ?? "", fromArray[2] ?? "", fromArray[3] ?? "", fromArray[4] ?? ""];
  return {
    subId1: values[0] ?? "",
    subId2: values[1] ?? "",
    subId3: values[2] ?? "",
    subId4: values[3] ?? "",
    subId5: values[4] ?? ""
  };
}

function safeJsonParse(value: unknown) {
  if (typeof value !== "string" && !Buffer.isBuffer(value)) return null;
  try {
    return JSON.parse(value.toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class ZerunExtensionBridge {
  private httpServer: Server | null = null;
  private wsServer: any | null = null;
  private socket: any | null = null;
  private pending = new Map<string, PendingRequest>();
  private busy = false;
  private currentTaskId: string | null = null;
  private lastError: string | null = null;
  private lastResult: ExtensionConvertResult | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private readonly port = Number(process.env.ZERUN_EXTENSION_WS_PORT ?? 17385),
    private readonly host = process.env.ZERUN_EXTENSION_WS_HOST ?? "127.0.0.1"
  ) {}

  async start() {
    if (this.started) return;
    try {
      await new Promise<void>((resolve, reject) => {
        this.httpServer = createServer();
        this.wsServer = new WebSocketServer({ server: this.httpServer });
        this.wsServer.on("connection", (socket: any) => this.attachSocket(socket));
        this.startHeartbeat();
        this.httpServer.once("error", reject);
        this.httpServer.listen(this.port, this.host, () => {
          this.started = true;
          logger.info("Zerun extension WebSocket bridge đã bật", { url: `ws://${this.host}:${this.port}` });
          resolve();
        });
      });
    } catch (error) {
      this.wsServer = null;
      this.httpServer = null;
      this.started = false;
      throw error;
    }
  }

  async stop() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Zerun extension bridge đã dừng."));
    }
    this.pending.clear();
    this.socket?.close?.();
    this.socket = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await new Promise<void>((resolve) => this.wsServer?.close?.(() => resolve()) ?? resolve());
    await new Promise<void>((resolve) => this.httpServer?.close?.(() => resolve()) ?? resolve());
    this.wsServer = null;
    this.httpServer = null;
    this.started = false;
  }

  getStatus() {
    return {
      wsUrl: `ws://${this.host}:${this.port}`,
      connected: Boolean(this.socket && this.socket.readyState === 1),
      busy: this.busy,
      currentTaskId: this.currentTaskId,
      lastError: this.lastError,
      lastResult: this.lastResult
    };
  }

  async convert(input: ExtensionConvertInput): Promise<ExtensionConvertResult> {
    if (this.busy) {
      return {
        status: "FAILED",
        sourceUrl: input.url,
        convertedUrl: null,
        errorCode: "EXTENSION_NOT_READY",
        message: "Extension chưa sẵn sàng để nhận link mới. Hãy thử lại sau vài giây."
      };
    }

    return this.convertNow(input);
  }

  private attachSocket(socket: ExtensionSocket) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.close(1000, "New Zerun extension connection attached");
    }
    socket.isAlive = true;
    this.socket = socket;
    this.lastError = null;
    logger.info("Zerun extension đã kết nối");

    socket.on("message", (raw: unknown) => this.handleMessage(raw));
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
        this.failPendingRequests("EXTENSION_DISCONNECTED", "Extension Shopee Affiliate đã ngắt kết nối Zerun.");
      }
      logger.warn("Zerun extension đã ngắt kết nối");
    });
    socket.on("error", (error: Error) => {
      this.lastError = error.message;
      logger.warn("Zerun extension WebSocket lỗi", { error: error.message });
    });
  }

  private handleMessage(raw: unknown) {
    const message = safeJsonParse(raw);
    if (!message) return;
    const type = String(message.type ?? "");
    const requestId = typeof message.requestId === "string" ? message.requestId : "";

    if (type === "PING") {
      this.send({ type: "PONG", requestId, ts: Date.now() });
      return;
    }

    if (type === "STATUS_UPDATE") {
      this.currentTaskId = typeof message.taskId === "string" ? message.taskId : this.currentTaskId;
      return;
    }

    if (type === "LAZADA_SYNC_SUBID_RESULT") {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      this.busy = false;
      this.currentTaskId = null;
      pending.resolve(message);
      return;
    }

    if (type === "CONVERT_RESULT" || type === "BUSY" || type === "NEED_LOGIN" || type === "NEED_MANUAL_VERIFY") {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      this.busy = false;
      this.currentTaskId = null;

      const status = type === "BUSY"
        ? "FAILED"
        : type === "NEED_LOGIN"
          ? "NEED_LOGIN"
          : type === "NEED_MANUAL_VERIFY"
            ? "NEED_MANUAL_VERIFY"
            : String(message.status ?? "FAILED");
      const result: ExtensionConvertResult = {
        status: status === "DONE" || status === "NEED_LOGIN" || status === "NEED_MANUAL_VERIFY" || status === "TIMEOUT" ? status : "FAILED",
        sourceUrl: String(message.sourceUrl ?? ""),
        shortLink: typeof message.shortLink === "string" ? message.shortLink : null,
        longLink: typeof message.longLink === "string" ? message.longLink : null,
        rawLongLink: typeof message.rawLongLink === "string" ? message.rawLongLink : null,
        convertedUrl: typeof message.shortLink === "string" ? message.shortLink : typeof message.longLink === "string" ? message.longLink : null,
        failCode: typeof message.failCode === "string" ? message.failCode : null,
        errorCode: typeof message.errorCode === "string" ? message.errorCode : type === "BUSY" ? "EXTENSION_BUSY" : null,
        message: typeof message.message === "string" ? message.message : null,
        via: typeof message.via === "string" ? message.via : null,
        meta: message.meta
      };
      this.lastResult = result;
      if (result.status !== "DONE") this.lastError = result.message ?? result.errorCode ?? "Extension convert failed";
      pending.resolve(result);
    }
  }

  async syncLazadaSubId(action: "add" | "edit" | "delete", template: any): Promise<any> {
    if (this.busy) {
      return {
        success: false,
        errorCode: "EXTENSION_BUSY",
        message: "Extension đang bận xử lý tác vụ khác. Vui lòng thử lại sau."
      };
    }

    const socket = this.socket;
    if (!socket || socket.readyState !== 1) {
      return {
        success: false,
        errorCode: "EXTENSION_DISCONNECTED",
        message: "Extension Shopee Affiliate chưa kết nối Zerun."
      };
    }

    const requestId = `req_${randomUUID()}`;
    const taskId = `sync_${randomUUID()}`;
    const timeoutMs = 25000;
    this.busy = true;
    this.currentTaskId = taskId;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.busy = false;
        this.currentTaskId = null;
        resolve({
          success: false,
          errorCode: "TIMEOUT",
          message: "Extension không phản hồi kết quả đồng bộ Sub ID."
        });
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: () => {},
        timer,
        taskId
      });

      this.send({
        type: "LAZADA_SYNC_SUBID",
        requestId,
        taskId,
        action,
        template
      });
    });
  }

  private convertNow(input: ExtensionConvertInput): Promise<ExtensionConvertResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) {
      return Promise.resolve({
        status: "FAILED",
        sourceUrl: input.url,
        convertedUrl: null,
        errorCode: "EXTENSION_DISCONNECTED",
        message: "Extension Shopee Affiliate chưa kết nối Zerun."
      });
    }

    if (!input.url?.trim()) {
      return Promise.resolve({
        status: "FAILED",
        sourceUrl: "",
        convertedUrl: null,
        errorCode: "INVALID_TASK",
        message: "URL cần convert không được để trống."
      });
    }

    const requestId = `req_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const timeoutMs = Math.max(5_000, Number(process.env.ZERUN_EXTENSION_REQUEST_TIMEOUT_MS ?? 45_000));
    this.busy = true;
    this.currentTaskId = taskId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.busy = false;
        this.currentTaskId = null;
        resolve({
          status: "TIMEOUT",
          sourceUrl: input.url,
          convertedUrl: null,
          errorCode: "TIMEOUT",
          message: "Extension không trả kết quả trong thời gian chờ."
        });
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer, taskId });
      this.send({
        type: "CONVERT_LINK",
        requestId,
        taskId,
        url: input.url,
        subIds: normalizeSubIds(input),
        lazadaSubIdSet: input.lazadaSubIdSet,
        outputType: input.outputType ?? "shortlink"
      });
    });
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    const intervalMs = Math.max(10_000, Number(process.env.ZERUN_EXTENSION_HEARTBEAT_MS ?? 30_000));
    this.heartbeatTimer = setInterval(() => {
      const socket = this.socket as ExtensionSocket | null;
      if (!socket || socket.readyState !== 1) return;
      if (socket.isAlive === false) {
        this.lastError = "Extension không phản hồi heartbeat.";
        logger.warn("Zerun extension không phản hồi heartbeat, đóng socket để extension reconnect.");
        if (socket.terminate) socket.terminate();
        else socket.close?.(4000, "Heartbeat timeout");
        if (this.socket === socket) {
          this.socket = null;
          this.failPendingRequests("EXTENSION_DISCONNECTED", "Extension Shopee Affiliate không phản hồi heartbeat.");
        }
        return;
      }
      socket.isAlive = false;
      socket.ping?.();
      this.send({ type: "GET_STATUS", requestId: `status_${Date.now()}` });
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private failPendingRequests(errorCode: string, message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({
        status: "FAILED",
        sourceUrl: "",
        convertedUrl: null,
        errorCode,
        message
      });
    }
    this.pending.clear();
    this.busy = false;
    this.currentTaskId = null;
    this.lastError = message;
  }
}

export const zerunExtensionBridge = new ZerunExtensionBridge();
