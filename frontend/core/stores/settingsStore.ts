import { create } from "zustand";
import { api } from "@core/api/client";

/** 服务端只回「配没配 + 掩码尾巴」，明文 key 永不回前端；地址/模型不是秘密，直接回值 */
export interface AISettings {
  ai_configured: boolean;
  key_source: "db" | "env" | null;
  key_hint: string | null;
  base_url: string;
  base_url_source: "db" | "env";
  model: string;
  model_source: "db" | "env";
}

/** 三态与服务端一致：字段省略 = 不动；空串 = 清除覆盖、回落 .env 默认 */
export interface AIConfigPatch {
  api_key?: string;
  base_url?: string;
  model?: string;
}

interface SettingsState {
  ai: AISettings | null; // null = 还没拉过（未配置横幅据此不闪）
  fetchSettings: () => Promise<void>;
  saveConfig: (patch: AIConfigPatch) => Promise<void>;
  clearKey: () => Promise<void>;
  testKey: () => Promise<{ ok: boolean; detail: string; models: string[] }>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ai: null,

  fetchSettings: async () => {
    try {
      set({ ai: await api.get<AISettings>("/api/settings") });
    } catch {
      // 拉不到就不提示（老后端/网络抖动不该弹错）
    }
  },

  saveConfig: async (patch) => {
    set({ ai: await api.put<AISettings>("/api/settings/ai-config", patch) });
  },

  clearKey: async () => {
    set({ ai: await api.put<AISettings>("/api/settings/ai-config", { api_key: "" }) });
  },

  testKey: () => api.post<{ ok: boolean; detail: string; models: string[] }>("/api/settings/ai-config/test"),
}));
