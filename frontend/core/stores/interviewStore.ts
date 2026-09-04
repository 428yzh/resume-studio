import { create } from "zustand";
import { api } from "@core/api/client";
import type { MockInterview, InterviewListItem, StartInterviewRequest } from "@core/models/mockInterview";
import { isUnavailable } from "@core/services/aiDegrade";

interface InterviewState {
  sessions: InterviewListItem[];
  currentSession: MockInterview | null;
  streamingContent: string;
  streamingScore: { score: number; feedback: string } | null;
  currentDifficulty: string | null;
  isStreaming: boolean;
  loading: boolean;
  error: string | null;

  startInterview: (req: StartInterviewRequest) => Promise<MockInterview>;
  askQuestion: (interviewId: number, content: string) => Promise<void>;
  fetchSession: (id: number) => Promise<void>;
  endInterview: (id: number) => Promise<MockInterview>;
  deleteInterview: (id: number) => Promise<void>;
  fetchSessions: (status?: string) => Promise<void>;
  clearStreaming: () => void;
}

export const useInterviewStore = create<InterviewState>((set, get) => ({
  sessions: [],
  currentSession: null,
  streamingContent: "",
  streamingScore: null,
  currentDifficulty: null,
  isStreaming: false,
  loading: false,
  error: null,

  clearStreaming: () => {
    set({ streamingContent: "", streamingScore: null, currentDifficulty: null, isStreaming: false });
  },

  startInterview: async (req: StartInterviewRequest) => {
    set({ loading: true, error: null });
    try {
      const session = await api.post<MockInterview>("/api/mock-interview/start", req);
      set({ currentSession: session, loading: false });
      return session;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  askQuestion: async (interviewId: number, content: string) => {
    const { currentSession } = get();
    if (!currentSession) return;

    set({ isStreaming: true, streamingScore: null, streamingContent: "" });

    // Add user message immediately
    const userMsg = {
      id: Date.now(),
      role: "user" as const,
      content,
      question_type: "answer" as const,
      metadata_json: {},
      created_at: new Date().toISOString(),
    };

    set({
      currentSession: {
        ...currentSession,
        messages: [...currentSession.messages, userMsg],
      },
    });

    try {
      const resp = await fetch(`/api/mock-interview/${interviewId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "evaluation") {
                set({
                  streamingScore: { score: parsed.score, feedback: parsed.feedback },
                });
                // Update last user message metadata
                const msgs = get().currentSession?.messages || [];
                const lastUserIdx = msgs.length - 1;
                if (lastUserIdx >= 0 && msgs[lastUserIdx].role === "user") {
                  const updated = [...msgs];
                  updated[lastUserIdx] = {
                    ...updated[lastUserIdx],
                    metadata_json: { score: parsed.score, feedback: parsed.feedback },
                  };
                  set({ currentSession: { ...get().currentSession!, messages: updated } });
                }
              } else if (parsed.type === "response" && parsed.content) {
                aiContent += parsed.content;
                set({ streamingContent: aiContent });
              } else if (parsed.type === "difficulty_change") {
                set({ currentDifficulty: parsed.to });
                const cs = get().currentSession;
                if (cs) {
                  set({ currentSession: { ...cs, difficulty_level: parsed.to } });
                }
              } else if (parsed.type === "done") {
                // AI 降级文案不当聊天内容，转入错误态
                if (isUnavailable(aiContent)) {
                  set({ error: "AI 服务暂不可用，请稍后再试", streamingContent: "", isStreaming: false });
                  return;
                }
                // AI response complete — append to messages
                const aiMsg = {
                  id: Date.now() + 1,
                  role: "ai" as const,
                  content: aiContent,
                  question_type: "interview" as const,
                  metadata_json: {},
                  created_at: new Date().toISOString(),
                };
                const msgs = get().currentSession?.messages || [];
                set({
                  currentSession: {
                    ...get().currentSession!,
                    messages: [...msgs, aiMsg],
                  },
                  streamingContent: "",
                  isStreaming: false,
                });
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } catch (e) {
      set({ error: (e as Error).message, isStreaming: false });
    }
  },

  fetchSession: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const session = await api.get<MockInterview>(`/api/mock-interview/${id}`);
      set({ currentSession: session, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  endInterview: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const session = await api.post<MockInterview>(`/api/mock-interview/${id}/end`);
      set({ currentSession: session, loading: false });
      return session;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  deleteInterview: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await api.del(`/api/mock-interview/${id}`);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  fetchSessions: async (status?: string) => {
    set({ loading: true, error: null });
    try {
      const url = status ? `/api/mock-interview/list?status=${status}` : "/api/mock-interview/list";
      const sessions = await api.get<InterviewListItem[]>(url);
      set({ sessions, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
