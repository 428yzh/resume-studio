import { useEffect, useState } from "react";
import { useSettingsStore, type AIConfigPatch } from "@core/stores/settingsStore";
import AIErrorBox from "@web/components/AIErrorBox";
import { CheckCircle, Gear, Warning } from "@phosphor-icons/react";

export default function Settings() {
  const { ai, fetchSettings, saveConfig, clearKey, testKey } = useSettingsStore();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [models, setModels] = useState<string[]>([]); // 测试连接拉回的可用模型，供输入建议
  const [busy, setBusy] = useState<"" | "save" | "clear" | "test">("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 用服务端已生效的值回填表单（保存后也会回到这里的规范值）
  useEffect(() => {
    if (ai) {
      setBaseUrl(ai.base_url);
      setModel(ai.model);
    }
  }, [ai]);

  const configured = ai?.ai_configured === true;
  const sourceLabel = ai?.key_source === "db" ? "此页面" : ai?.key_source === "env" ? "配置文件" : "";

  const handleSave = async () => {
    setBusy("save");
    setError("");
    setNotice(null);
    try {
      const patch: AIConfigPatch = { base_url: baseUrl.trim(), model: model.trim() };
      if (keyInput.trim()) patch.api_key = keyInput.trim(); // 留空 = 不改 key，不会误清
      await saveConfig(patch);
      setKeyInput("");
      setNotice({ ok: true, text: "已保存，AI 功能立即生效" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setError("");
    setNotice(null);
    try {
      const r = await testKey();
      setModels(r.models || []);
      setNotice({ ok: r.ok, text: r.models?.length ? `${r.detail} · 发现 ${r.models.length} 个可用模型` : r.detail });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleClear = async () => {
    setBusy("clear");
    setError("");
    setNotice(null);
    try {
      await clearKey();
      setNotice({ ok: true, text: "已清除，改用配置文件里的 key（如果有的话）" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
          <Gear size={24} className="text-blue" />
          设置
        </h2>
        <p className="text-sm text-slate">AI 服务的连接配置。保存后立即生效。</p>
      </div>

      <div className="bg-canvas rounded-xl border border-hairline p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-ink">AI 服务</h3>
          {ai &&
            (configured ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green bg-green-light/50 rounded-full px-2.5 py-1">
                <CheckCircle size={14} weight="fill" /> 已配置
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber bg-amber-light/50 rounded-full px-2.5 py-1">
                <Warning size={14} weight="fill" /> 未配置
              </span>
            ))}
        </div>
        <p className="text-sm text-slate mb-5">
          润色、JD 分析、出题、讲解、费曼教学都用这套配置。默认接 DeepSeek，换成别的 AI 服务也行 —— 填它的地址和 key 即可。
        </p>

        {ai && !configured && (
          <div className="bg-amber-light/40 border border-amber/20 rounded-lg px-4 py-3 text-sm text-charcoal mb-5">
            还没有 API key —— 去{" "}
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="text-blue font-medium hover:underline"
            >
              DeepSeek 开放平台
            </a>{" "}
            申请一个，粘贴到下面保存即可。
          </div>
        )}

        <label className="block text-sm font-medium text-ink mb-1.5">接口地址</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1"
          className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm font-mono mb-4"
        />

        <label className="block text-sm font-medium text-ink mb-1.5">API key</label>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={configured ? "粘贴新 key 以替换（留空 = 不改）" : "sk-…"}
          autoComplete="new-password"
          className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm font-mono mb-1.5"
        />
        <p className="text-xs text-muted mb-4">
          {configured && ai?.key_hint ? (
            <>
              当前：<span className="font-mono text-charcoal">{ai.key_hint}</span>（来源：{sourceLabel}）。key 只保存在本机，页面上不会显示完整内容。
            </>
          ) : (
            "key 只保存在本机，页面上不会显示完整内容。"
          )}
        </p>

        <label className="block text-sm font-medium text-ink mb-1.5">模型</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-v4-flash"
          className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm font-mono mb-1.5"
        />
        <p className={`text-xs text-muted ${models.length > 0 ? "mb-2" : "mb-5"}`}>
          {models.length > 0
            ? "点一下模型名即可填入。列表来自该服务，可能不全，也可以直接手输。"
            : "留默认即可。点「测试连接」可以看到这个服务提供哪些模型。"}
        </p>
        {/* 不用 <datalist>：Chrome 会拿输入框现值去过滤建议 —— 当前是 deepseek-v4-flash 时，
            服务端报的 deepseek-flash / deepseek-v4-pro 全被滤掉，点开就是空的（用户报的「下拉框 bug」）。
            改成显式列表：不过滤、点一下填入，手输照旧。 */}
        {models.length > 0 && (
          <div className="border border-hairline rounded-lg max-h-36 overflow-y-auto mb-5">
            {models.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`w-full text-left px-3 py-1.5 text-sm font-mono transition-colors ${
                  m === model ? "bg-blue-light/40 text-blue" : "text-charcoal hover:bg-surface"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={busy !== ""}
            className="bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 hover:bg-blue/90"
          >
            {busy === "save" ? "保存中…" : "保存"}
          </button>
          <button
            onClick={handleTest}
            disabled={!configured || busy !== ""}
            className="bg-transparent text-ink border border-hairline rounded-full px-5 py-2 text-sm font-medium transition-all active:scale-95 disabled:opacity-40 hover:bg-surface"
          >
            {busy === "test" ? "测试中…" : "测试连接"}
          </button>
          {ai?.key_source === "db" && (
            <button
              onClick={handleClear}
              disabled={busy !== ""}
              className="ml-auto text-sm text-red hover:underline disabled:opacity-40"
            >
              {busy === "clear" ? "清除中…" : "清除这里设置的 key"}
            </button>
          )}
        </div>

        {notice && <p className={`text-sm mt-3 ${notice.ok ? "text-green" : "text-red"}`}>{notice.text}</p>}
        {error && (
          <div className="mt-3">
            <AIErrorBox message={error} />
          </div>
        )}

        <p className="text-xs text-muted mt-5 pt-4 border-t border-hairline">
          换成别的服务时，岗位推荐和资源搜索会搜不到（它们依赖 DeepSeek 专属接口），其余功能正常使用。
        </p>
      </div>
    </div>
  );
}
