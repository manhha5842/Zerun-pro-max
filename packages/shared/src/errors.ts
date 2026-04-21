export type ZerunErrorKind =
  | "adapter_auth"
  | "adapter_rate_limit"
  | "adapter_checkpoint"
  | "unsupported_media"
  | "retryable_network"
  | "validation"
  | "configuration"
  | "unknown";

export class ZerunError extends Error {
  readonly kind: ZerunErrorKind;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(kind: ZerunErrorKind, message: string, options: { retryable?: boolean; details?: unknown } = {}) {
    super(message);
    this.name = "ZerunError";
    this.kind = kind;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class AdapterAuthError extends ZerunError {
  constructor(message = "Tài khoản nền tảng không xác thực được", details?: unknown) {
    super("adapter_auth", message, { details });
    this.name = "AdapterAuthError";
  }
}

export class AdapterRateLimitError extends ZerunError {
  constructor(message = "Nền tảng đang giới hạn tần suất", details?: unknown) {
    super("adapter_rate_limit", message, { retryable: true, details });
    this.name = "AdapterRateLimitError";
  }
}

export class AdapterCheckpointError extends ZerunError {
  constructor(message = "Tài khoản cần xử lý checkpoint", details?: unknown) {
    super("adapter_checkpoint", message, { details });
    this.name = "AdapterCheckpointError";
  }
}

export class RetryableNetworkError extends ZerunError {
  constructor(message = "Lỗi mạng tạm thời", details?: unknown) {
    super("retryable_network", message, { retryable: true, details });
    this.name = "RetryableNetworkError";
  }
}

export class ConfigurationError extends ZerunError {
  constructor(message = "Thiếu cấu hình bắt buộc", details?: unknown) {
    super("configuration", message, { details });
    this.name = "ConfigurationError";
  }
}

export function classifyError(error: unknown): ZerunError {
  if (error instanceof ZerunError) return error;
  if (error instanceof Error) return new ZerunError("unknown", error.message, { details: error.stack });
  return new ZerunError("unknown", "Lỗi không xác định", { details: error });
}
