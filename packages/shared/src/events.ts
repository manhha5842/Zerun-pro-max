import { EventEmitter } from "node:events";
import type { HealthStatus, Platform } from "./types.js";

export type RealtimeEvent =
  | {
      type: "content:new";
      contentId: string;
      code: string;
      platform: Platform;
      createdAt: string;
    }
  | {
      type: "content:status";
      contentId: string;
      code: string;
      status: string;
      createdAt: string;
    }
  | {
      type: "publish:success";
      contentId: string;
      targetId: string;
      platform: Platform;
      resultUrl?: string;
      createdAt: string;
    }
  | {
      type: "publish:failed";
      contentId: string;
      targetId: string;
      platform: Platform;
      error: string;
      createdAt: string;
    }
  | {
      type: "platform:health";
      accountId: string;
      accountKind: "source" | "target";
      platform: Platform;
      health: HealthStatus;
      createdAt: string;
    }
  | {
      type: "crawl:complete";
      sourceId: string;
      platform: Platform;
      itemCount: number;
      createdAt: string;
    };

export class RealtimeBus extends EventEmitter {
  emitEvent(event: RealtimeEvent): void {
    this.emit("event", event);
  }

  onEvent(listener: (event: RealtimeEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const realtimeBus = new RealtimeBus();
