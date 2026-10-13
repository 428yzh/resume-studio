import { create } from "zustand";
import { api } from "@core/api/client";
import type {
  FeynmanTopic,
  FeynmanTopicListItem,
  FeynmanMessage,
  FeynmanProblem,
  CreateTopicRequest,
} from "@core/models/feynman";

/** 单个房间的聊天状态（房间隔离：各房间独立，互不干扰） */
interface RoomState {
  topic: FeynmanTopic | null;
  streamingContent: string;
  streamingLevel: number | null;
  streamingAction: string;
  isStreaming: boolean;
}

const EMPTY_ROOM: RoomState = {
  topic: null,
  streamingContent: "",
  streamingLevel: null,
  streamingAction: "",
  isStreaming: false,
};

interface FeynmanState {
  topics: FeynmanTopicListItem[]; // 房间列表（共享）
  rooms: Record<number, RoomState>; // 聊天状态按房间 id 隔离
  loading: boolean;
  error: string | null;

  fetchTopics: () => Promise<void>;
  fetchTopic: (id: number) => Promise<void>;
  createTopic: (req: CreateTopicRequest) => Promise<FeynmanTopic>;
  sendMessage: (topicId: number, content: string) => Promise<void>;
  generateReport: (topicId: number) => Promise<boolean>;
  deleteTopic: (id: number) => Promise<void>;
  addProblem: (topicId: number, content: string) => Promise<void>;
  setProblemStatus: (topicId: number, problemId: number, status: "open" | "resolved") => Promise<void>;
}

/** 取房间状态，不存在则给空房间（只读用，避免污染） */
function roomOf(state: FeynmanState, id: number): RoomState {
  return state.rooms[id] ?? EMPTY_ROOM;
}

/** 更新单个房间，其他房间不动 */
function patchRoom(state: FeynmanState, id: number, patch: Partial<RoomState>): Pick<FeynmanState, "rooms"> {
  return { rooms: { ...state.rooms, [id]: { ...roomOf(state, id), ...patch } } };
}

export const useFeynmanStore = create<FeynmanState>((set, get) => ({
  topics: [],
  rooms: {},
  loading: false,
  error: null,

  fetchTopics: async () => {
    set({ loading: true, error: null });
    try {
      const topics = await api.get<FeynmanTopicListItem[]>("/api/feynman/topics");
      set({ topics, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchTopic: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const topic = await api.get<FeynmanTopic>(`/api/feynman/topics/${id}`);
      set((state) => ({ ...patchRoom(state, id, { topic }), loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createTopic: async (req: CreateTopicRequest) => {
    set({ loading: true, error: null });
    try {
      const topic = await api.post<FeynmanTopic>("/api/feynman/topics", req);
      set({ loading: false });
      return topic;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  sendMessage: async (topicId: number, content: string) => {
    const room = roomOf(get(), topicId);
    if (!room.topic) return;

    // 该房间进入流式态（其他房间不受影响）
    set((state) => patchRoom(state, topicId, { isStreaming: true, streamingLevel: null, streamingAction: "", streamingContent: "" }));

    // 用户讲解立刻上屏
    const userMsg: FeynmanMessage = {
      id: Date.now(),
      role: "user",
      content,
      level: null,
      action: "teaching",
      created_at: new Date().toISOString(),
    };
    set((state) => {
      const r = roomOf(state, topicId);
      if (!r.topic) return {};
      return patchRoom(state, topicId, { topic: { ...r.topic, messages: [...r.topic.messages, userMsg] } });
    });

    try {
      const resp = await fetch(`/api/feynman/topics/${topicId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiContent = "";
      let aiLevel: number | null = null;
      let aiAction = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "level") {
              aiLevel = parsed.level;
              aiAction = parsed.action;
              set((state) => {
                const r = roomOf(state, topicId);
                return patchRoom(state, topicId, {
                  streamingLevel: parsed.level,
                  streamingAction: parsed.action,
                  topic: r.topic ? { ...r.topic, level: parsed.level } : r.topic,
                });
              });
            } else if (parsed.type === "response" && parsed.content) {
              aiContent += parsed.content;
              set((state) => patchRoom(state, topicId, { streamingContent: aiContent }));
            } else if (parsed.type === "done") {
              const aiMsg: FeynmanMessage = {
                id: Date.now() + 1,
                role: "ai",
                content: aiContent,
                level: aiLevel,
                action: aiAction,
                created_at: new Date().toISOString(),
              };
              set((state) => {
                const r = roomOf(state, topicId);
                if (!r.topic) return {};
                return patchRoom(state, topicId, {
                  topic: { ...r.topic, messages: [...r.topic.messages, aiMsg] },
                  streamingContent: "",
                  streamingLevel: null,
                  streamingAction: "",
                  isStreaming: false,
                });
              });
              // 同步后端预算/等级（只更新该房间）
              await get().fetchTopic(topicId);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // 兜底收尾：流结束了却没收到 done 帧（连接被掐断/帧丢失）也要复位，
      // 否则该房间永久卡在 isStreaming=true，下一条消息再也发不出去。
      // done 已处理过时 isStreaming 已是 false，这里跳过；半截回复留成 AI 消息，不丢内容。
      set((state) => {
        const r = roomOf(state, topicId);
        if (!r.isStreaming || !r.topic) return {};
        const partial: FeynmanMessage = {
          id: Date.now() + 1,
          role: "ai",
          content: aiContent,
          level: aiLevel,
          action: aiAction,
          created_at: new Date().toISOString(),
        };
        return patchRoom(state, topicId, {
          topic: aiContent ? { ...r.topic, messages: [...r.topic.messages, partial] } : r.topic,
          streamingContent: "",
          streamingLevel: null,
          streamingAction: "",
          isStreaming: false,
        });
      });
    } catch (e) {
      set((state) =>
        patchRoom(state, topicId, { isStreaming: false, streamingContent: "", streamingLevel: null, streamingAction: "" })
      );
      set({ error: (e as Error).message });
    }
  },

  generateReport: async (topicId: number) => {
    set({ loading: true, error: null });
    try {
      const resp = await fetch(`/api/feynman/topics/${topicId}/report`, { method: "POST" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const topic = get().rooms[topicId]?.topic;
      const filename = `${topic?.name || "费曼"}-学习报告.pptx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      set({ loading: false });
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  deleteTopic: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await api.del(`/api/feynman/topics/${id}`);
      set((state) => {
        const rooms = { ...state.rooms };
        delete rooms[id];
        return { topics: state.topics.filter((t) => t.id !== id), rooms, loading: false };
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  addProblem: async (topicId: number, content: string) => {
    const problem = await api.post<FeynmanProblem>(`/api/feynman/topics/${topicId}/problems`, { content });
    set((state) => {
      const r = roomOf(state, topicId);
      if (!r.topic) return {};
      return patchRoom(state, topicId, {
        topic: { ...r.topic, problems: [...r.topic.problems, problem] },
      });
    });
  },

  setProblemStatus: async (topicId: number, problemId: number, status: "open" | "resolved") => {
    const updated = await api.put<FeynmanProblem>(`/api/feynman/topics/${topicId}/problems/${problemId}`, { status });
    set((state) => {
      const r = roomOf(state, topicId);
      if (!r.topic) return {};
      return patchRoom(state, topicId, {
        topic: {
          ...r.topic,
          problems: r.topic.problems.map((p) => (p.id === problemId ? updated : p)),
        },
      });
    });
  },
}));
