import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { invalidateAiProviderCache, loadAiProvider } from "../packages/worker-core/src/ai/provider-factory";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("AI settings contract", () => {
  it("uses Settings AI as the single global AI source for API and worker", () => {
    const apiApp = read("apps/api/src/app.ts");
    const providerFactory = read("packages/worker-core/src/ai/provider-factory.ts");
    const setupPage = read("apps/web-admin/src/pages/SetupSettingsPages.tsx");
    const providerDocs = read("packages/core/src/ai/provider.ts");

    expect(apiApp).toContain("saveAiSettings(settings)");
    expect(apiApp).toContain("invalidateAiProviderCache");
    expect(apiApp).toContain("if (result.ok) await saveAiSettings(settings)");
    expect(apiApp).not.toContain("syncAiSettingsToConfig");
    expect(apiApp).not.toContain("prisma.aiConfig.upsert");
    expect(providerFactory).toContain("tryBuildFromSettings(prisma)");
    expect(providerFactory).not.toContain("prisma.aiConfig.findFirst");
    expect(providerFactory).not.toContain("AiConfig active");
    expect(setupPage).not.toContain("AiConfig");
    expect(providerDocs).not.toContain("AiConfig");
  });

  it("loads the worker AI provider from saved settings", async () => {
    const oldNinerouterUrl = process.env.NINEROUTER_URL;
    const oldAiBaseUrl = process.env.AI_BASE_URL;
    const oldNinerouterKey = process.env.NINEROUTER_KEY;
    const oldAiApiKey = process.env.AI_API_KEY;
    delete process.env.NINEROUTER_URL;
    delete process.env.AI_BASE_URL;
    delete process.env.NINEROUTER_KEY;
    delete process.env.AI_API_KEY;
    invalidateAiProviderCache();

    try {
      const provider = await loadAiProvider({
        systemSetting: {
          findUnique: async () => ({
            value: {
              provider: "https://api.9router.ai",
              apiKey: "test-key",
              model: "auto"
            }
          })
        }
      } as never);

      expect(provider?.name).toBe("openai-compatible:https://api.9router.ai");
    } finally {
      if (oldNinerouterUrl === undefined) delete process.env.NINEROUTER_URL;
      else process.env.NINEROUTER_URL = oldNinerouterUrl;
      if (oldAiBaseUrl === undefined) delete process.env.AI_BASE_URL;
      else process.env.AI_BASE_URL = oldAiBaseUrl;
      if (oldNinerouterKey === undefined) delete process.env.NINEROUTER_KEY;
      else process.env.NINEROUTER_KEY = oldNinerouterKey;
      if (oldAiApiKey === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = oldAiApiKey;
      invalidateAiProviderCache();
    }
  });
});
