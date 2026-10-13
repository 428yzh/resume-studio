import { create } from "zustand";

/**
 * 问一问（结论 5）：每个学习单元一条对话。
 *
 * - 会话只活在内存里：刷新即失忆（结论 3），v1 不做持久化 —— 笔记才是要留住的东西
 * - 服务端无状态：每轮都现拼语境（技能备注 + 这块图谱 + 最新笔记原文，结论 10）
 * - 开场（messages: []）时服务端补一条「先读一遍笔记」的指令：AI 做简短点评 + 指不足，
 *   之后就是普通聊天。不判分、不落库（结论 27）
 */

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

/** 单个单元的会话。key = `${skillId}__${unitKey}` —— 不同单元互不干扰（同 feynman 房隔离） */
export interface ChatRoom {
  messages: ChatMessage[];
  /** 开场成功过没有：点开不重载、不回放开场（结论 2/16） */
  opened: boolean;
  streaming: boolean;
  error: string | null;
}

const EMPTY_ROOM: ChatRoom = { messages: [], opened: false, streaming: false, error: null };

interface ChatState {
  rooms: Record<string, ChatRoom>;
  /** 打开会话：没开过就开场（让 AI 先读一遍笔记），开过则是 no-op */
  open: (skillId: number, unitKey: string) => Promise<void>;
  ask: (skillId: number, unitKey: string, text: string) => Promise<void>;
  /** 重发失败的那一轮：半截回复被替换，不是接在后面重复追加（结论 19） */
  retry: (skillId: number, unitKey: string) => Promise<void>;
}

export const chatRoomKey = (skillId: number, unitKey: string) => `${skillId}__${unitKey}`;

export const useChatStore = create<ChatState>((set, get) => {
  /** 发一轮并流式收字。history 是这轮要发的完整历史（不含本轮的 AI 回复） */
  const runTurn = async (skillId: number, unitKey: string, history: ChatMessage[]) => {
    const key = chatRoomKey(skillId, unitKey);
    const patch = (p: Partial<ChatRoom>) =>
      set((s) => ({ rooms: { ...s.rooms, [key]: { ...(s.rooms[key] ?? EMPTY_ROOM), ...p } } }));

    // 先挂上空的 AI 气泡，流式逐字往里填
    patch({ streaming: true, error: null, messages: [...history, { role: "ai", content: "" }] });

    let aiContent = "";
    /** 收尾：有半截就留半截（结论 19），一个字没有就撤掉空气泡 */
    const settle = (err: string | null) =>
      patch({
        streaming: false,
        error: err,
        messages: aiContent ? [...history, { role: "ai", content: aiContent }] : history,
      });

    try {
      const resp = await fetch(`/api/skills/${skillId}/notes/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_key: unitKey, messages: history }),
      });
      if (!resp.ok) {
        // FastAPI 错误体是 {"detail": "..."}，拿它当 error 文案
        let msg = `请求失败（${resp.status}）`;
        try {
          msg = (await resp.json()).detail || msg;
        } catch { /* 非 JSON 响应，用兜底文案 */ }
        throw new Error(msg);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let parsed: { content?: string; done?: boolean; error?: string };
          try {
            parsed = JSON.parse(line.slice(6));
          } catch {
            continue; // 半行/坏行跳过
          }
          if (parsed.content) {
            aiContent += parsed.content;
            patch({ messages: [...history, { role: "ai", content: aiContent }] });
          }
          if (parsed.done && parsed.error) streamError = parsed.error;
        }
      }
      // 开场成功才记 opened：失败的开场留着，下次点开/重试会再开一次
      if (!streamError) patch({ opened: true });
      settle(streamError);
    } catch (e) {
      settle(e instanceof Error ? e.message : "网络异常");
    }
  };

  return {
    rooms: {},

    open: async (skillId, unitKey) => {
      const room = get().rooms[chatRoomKey(skillId, unitKey)];
      if (room?.opened || room?.streaming) return; // 每单元单例：点开不重载（结论 2/16）
      await runTurn(skillId, unitKey, []);
    },

    ask: async (skillId, unitKey, text) => {
      const room = get().rooms[chatRoomKey(skillId, unitKey)];
      if (!room?.opened || room.streaming) return;
      await runTurn(skillId, unitKey, [...room.messages, { role: "user", content: text }]);
    },

    retry: async (skillId, unitKey) => {
      const room = get().rooms[chatRoomKey(skillId, unitKey)];
      if (!room || room.streaming || !room.error) return;
      // 去掉结尾那半截 AI 回复再重发 —— 重试是替换它，不是接在它后面
      const last = room.messages[room.messages.length - 1];
      const history = last?.role === "ai" ? room.messages.slice(0, -1) : room.messages;
      await runTurn(skillId, unitKey, history);
    },
  };
});
