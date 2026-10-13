import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock api client
vi.mock("../core/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { useSettingsStore, type AISettings } from "../core/stores/settingsStore";
import { api } from "../core/api/client";

const CONFIGURED: AISettings = {
  ai_configured: true,
  key_source: "db",
  key_hint: "sk-123…ghij",
  base_url: "https://api.deepseek.com/v1",
  base_url_source: "env",
  model: "deepseek-v4-flash",
  model_source: "db",
};
const UNCONFIGURED: AISettings = {
  ai_configured: false,
  key_source: null,
  key_hint: null,
  base_url: "https://api.deepseek.com/v1",
  base_url_source: "env",
  model: "deepseek-v4-flash",
  model_source: "env",
};

describe("TC-STORE-SET-001: fetchSettings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ai: null });
    vi.clearAllMocks();
  });

  it("loads AI status from GET /api/settings", async () => {
    vi.mocked(api.get).mockResolvedValue(UNCONFIGURED);
    await useSettingsStore.getState().fetchSettings();
    expect(api.get).toHaveBeenCalledWith("/api/settings");
    expect(useSettingsStore.getState().ai).toEqual(UNCONFIGURED);
  });

  it("keeps state on failure instead of throwing", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("HTTP 500"));
    await expect(useSettingsStore.getState().fetchSettings()).resolves.toBeUndefined();
    expect(useSettingsStore.getState().ai).toBeNull();
  });
});

describe("TC-STORE-SET-002: saveConfig / clearKey", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ai: null });
    vi.clearAllMocks();
  });

  it("saves patch and stores returned status", async () => {
    vi.mocked(api.put).mockResolvedValue(CONFIGURED);
    await useSettingsStore.getState().saveConfig({
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      api_key: "sk-1234567890abcdefghij",
    });
    expect(api.put).toHaveBeenCalledWith("/api/settings/ai-config", {
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      api_key: "sk-1234567890abcdefghij",
    });
    expect(useSettingsStore.getState().ai).toEqual(CONFIGURED);
  });

  it("omits api_key when only address/model change", async () => {
    vi.mocked(api.put).mockResolvedValue(CONFIGURED);
    await useSettingsStore.getState().saveConfig({ base_url: "https://gw.example/v1", model: "other" });
    const patch = vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>;
    expect("api_key" in patch).toBe(false); // 省略 = 不动，避免误清 key
  });

  it("clears key by sending empty string", async () => {
    vi.mocked(api.put).mockResolvedValue(UNCONFIGURED);
    await useSettingsStore.getState().clearKey();
    expect(api.put).toHaveBeenCalledWith("/api/settings/ai-config", { api_key: "" });
    expect(useSettingsStore.getState().ai).toEqual(UNCONFIGURED);
  });
});

describe("TC-STORE-SET-003: testKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes through {ok, detail, models} from POST /ai-config/test", async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true, detail: "连接正常", models: ["model-a"] });
    const r = await useSettingsStore.getState().testKey();
    expect(api.post).toHaveBeenCalledWith("/api/settings/ai-config/test");
    expect(r).toEqual({ ok: true, detail: "连接正常", models: ["model-a"] });
  });
});
