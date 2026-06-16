import { createHmac } from "node:crypto";
import { ConfigurationError } from "@zerun/shared";
import type { AffiliateAdapter, ConvertLinkInput, ConvertLinkResult } from "../contracts.js";
import type { DetectedLink } from "@zerun/shared";
import { detectLinks } from "@zerun/core";

/**
 * Lazada Affiliate Platform Open API — /marketing/getlink
 * Docs: https://open.lazada.com/apps/doc/api?path=%2Fmarketing%2Fgetlink
 *
 * ⛔ Test thật blocked cho đến khi User Token hết trạng thái Pending.
 * Build trước để route lazada có thể switch sau này.
 */

const LAZADA_API_BASE: Record<string, string> = {
  VN: "https://api.lazada.vn/rest",
  SG: "https://api.lazada.sg/rest",
  MY: "https://api.lazada.com.my/rest",
  TH: "https://api.lazada.co.th/rest",
  PH: "https://api.lazada.com.ph/rest",
  ID: "https://api.lazada.co.id/rest"
};

type LazadaOptions = {
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  region?: string;
};

type LazadaGetLinkResponse = {
  code: string;
  message?: string;
  result?: {
    result: Array<{
      status: "OK" | "INVALID" | "PENDING" | string;
      errorMessage?: string;
      errorCode?: string;
      dmLink?: string;
      mmLink?: string;
      normalLink?: string;
    }>;
  };
  request_id?: string;
};

export class LazadaAffiliateAdapter implements AffiliateAdapter {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly accessToken: string;
  private readonly apiBase: string;

  constructor(options: LazadaOptions = {}) {
    const appKey = options.appKey ?? process.env.LAZADA_APP_KEY ?? "";
    const appSecret = options.appSecret ?? process.env.LAZADA_APP_SECRET ?? "";
    const accessToken = options.accessToken ?? process.env.LAZADA_ACCESS_TOKEN ?? "";
    const region = options.region ?? process.env.LAZADA_REGION ?? "VN";

    if (!appKey || !appSecret || !accessToken) {
      throw new ConfigurationError(
        "Thiếu Lazada credentials: LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_ACCESS_TOKEN"
      );
    }

    this.appKey = appKey;
    this.appSecret = appSecret;
    this.accessToken = accessToken;
    this.apiBase = LAZADA_API_BASE[region] ?? LAZADA_API_BASE["VN"];
  }

  detect(text: string): DetectedLink[] {
    return detectLinks(text);
  }

  async convert(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    const result = await this.getLink(input.url, input.subId);
    return {
      original: input.url,
      converted: result.converted,
      network: "lazada",
      success: result.success,
      error: result.error
    };
  }

  /** Batch convert tối đa 100 URL một lúc. */
  async batchConvert(urls: string[], subId?: string): Promise<Array<{ url: string; converted: string | null; success: boolean; error?: string }>> {
    if (urls.length === 0) return [];

    const chunks = chunk(urls, 100);
    const results: Array<{ url: string; converted: string | null; success: boolean; error?: string }> = [];

    for (const ch of chunks) {
      const batchResults = await this.batchGetLinks(ch, subId);
      results.push(...batchResults);
    }

    return results;
  }

  private async getLink(url: string, subId?: string) {
    const results = await this.batchGetLinks([url], subId);
    return results[0] ?? { url, converted: null, success: false, error: "Không có kết quả" };
  }

  private async batchGetLinks(urls: string[], subId?: string) {
    const path = "/marketing/getlink";
    const timestamp = Date.now();

    let subIds: Record<string, string> = {};
    if (subId) {
      try {
        if (subId.startsWith("{") && subId.endsWith("}")) {
          subIds = JSON.parse(subId);
        }
      } catch {
        // Không phải JSON
      }
    }

    const params: Record<string, string> = {
      app_key: this.appKey,
      timestamp: String(timestamp),
      sign_method: "sha256",
      access_token: this.accessToken,
      tracking_id: subIds.subId1 || subId || "zerun",
      input_type: "url",
      sub_id_1: subIds.subId1 || subId || "zerun"
    };

    if (subIds.subId2) params.sub_id_2 = subIds.subId2;
    if (subIds.subId3) params.sub_id_3 = subIds.subId3;
    if (subIds.subId4) params.sub_id_4 = subIds.subId4;
    if (subIds.subId5) params.sub_id_5 = subIds.subId5;
    if (subIds.subId6) params.sub_id_6 = subIds.subId6;
    if (subIds.subId7) params.sub_id_7 = subIds.subId7;

    // Tạo body JSON cho list URL
    const body = JSON.stringify({ urls: urls.map((u) => ({ url: u })) });

    params.sign = this.sign(path, params);

    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const response = await fetch(`${this.apiBase}${path}?${queryString}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Zerun-Worker/1.0"
      },
      body,
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const err = `Lazada API HTTP ${response.status}`;
      return urls.map((url) => ({ url, converted: null, success: false, error: err }));
    }

    const payload = (await response.json()) as LazadaGetLinkResponse;

    if (payload.code !== "0") {
      const err = `Lazada API lỗi: ${payload.message ?? payload.code}`;
      return urls.map((url) => ({ url, converted: null, success: false, error: err }));
    }

    const items = payload.result?.result ?? [];
    return urls.map((url, i) => {
      const item = items[i];
      if (!item) return { url, converted: null, success: false, error: "Không có kết quả" };
      if (item.status === "INVALID") return { url, converted: null, success: false, error: item.errorMessage ?? "Link không hợp lệ" };
      if (item.status === "PENDING") return { url, converted: null, success: false, error: "Link đang pending duyệt" };
      // Ưu tiên: dm > mm > regular
      const converted = item.dmLink ?? item.mmLink ?? item.normalLink ?? null;
      return { url, converted, success: Boolean(converted) };
    });
  }

  /** HMAC-SHA256 signature theo Lazada Open API spec. */
  sign(path: string, params: Record<string, string>): string {
    const sorted = Object.keys(params)
      .filter((k) => k !== "sign")
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
    const toSign = `${path}${sorted}`;
    return createHmac("sha256", this.appSecret).update(toSign).digest("hex").toUpperCase();
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
