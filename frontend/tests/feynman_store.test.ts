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

import { useFeynmanStore } from "../core/stores/feynmanStore";
import { api } from "../core/api/client";
import type { FeynmanTopic, FeynmanTopicListItem } from "../core/models/feynman";

function makeTopic(over: Partial<FeynmanTopic> = {}): FeynmanTopic {
  return {
    id: 1,
    skill_id: null,
    name: "React Hooks",
    level: 1,
    status: "learning",
    breadth_left: 2,
    depth_left: 2,
    learning_summary: null,
    weak_points: [],
    knowledge_points: [],
    covered_points: [],
    problems: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    ...over,
  };
}

function makeListItem(over: Partial<FeynmanTopicListItem> = {}): FeynmanTopicListItem {
  return {
    id: 1,
    skill_id: null,
    name: "React Hooks",
    level: 1,
    status: "learning",
    breadth_left: 2,
    depth_left: 2,
    weak_points: [],
    has_problems: false,
    total_messages: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

/** 构造带 SSE 流的 Response */
function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const SSE_LEVEL = `data: {"type": "level", "level": 2, "action": "ask_example"}\n\n`;
const SSE_RESP1 = `data: {"type": "response", "content": "我复述一下", "done": false}\n\n`;
const SSE_RESP2 = `data: {"type": "response", "content": "你的讲解", "done": false}\n\n`;
const SSE_DONE = `data: {"type": "done", "done": true, "level": 2, "action": "ask_example"}\n\n`;

describe("TC-STORE-FEYN-001: fetchTopics 加载房间列表", () => {
  beforeEach(() => {
    useFeynmanStore.setState({ topics: [], loading: false, error: null });
  });

  it("GET /api/feynman/topics 并存储", async () => {
    const mock = [makeListItem({ id: 1 }), makeListItem({ id: 2, name: "TypeScript" })];
    vi.mocked(api.get).mockResolvedValue(mock);

    await useFeynmanStore.getState().fetchTopics();
    expect(api.get).toHaveBeenCalledWith("/api/feynman/topics");
    expect(useFeynmanStore.getState().topics.length).toBe(2);
  });
});

describe("TC-STORE-FEYN-002: createTopic 创建房间", () => {
  it("POST /api/feynman/topics 并返回 topic", async () => {
    const mock = makeTopic({ id: 9, name: "React Hooks" });
    vi.mocked(api.post).mockResolvedValue(mock);

    const result = await useFeynmanStore.getState().createTopic({ name: "React Hooks" });
    expect(api.post).toHaveBeenCalledWith("/api/feynman/topics", { name: "React Hooks" });
    expect(result.id).toBe(9);
  });
});

describe("TC-STORE-FEYN-003: deleteTopic 删除房间", () => {
  beforeEach(() => {
    useFeynmanStore.setState({ topics: [makeListItem({ id: 1 }), makeListItem({ id: 2 })] });
  });

  it("DELETE 后从列表移除", async () => {
    vi.mocked(api.del).mockResolvedValue(undefined);
    await useFeynmanStore.getState().deleteTopic(1);
    expect(api.del).toHaveBeenCalledWith("/api/feynman/topics/1");
    expect(useFeynmanStore.getState().topics.map((t) => t.id)).toEqual([2]);
  });
});

describe("TC-STORE-FEYN-004: fetchTopic 加载房间详情", () => {
  it("GET /api/feynman/topics/:id 并存储", async () => {
    const mock = makeTopic({ id: 1, level: 3, messages: [{ id: 1, role: "ai", content: "逻辑链", level: 3, action: "breadth_question", created_at: "" }] });
    vi.mocked(api.get).mockResolvedValue(mock);

    await useFeynmanStore.getState().fetchTopic(1);
    expect(useFeynmanStore.getState().rooms[1]?.topic?.level).toBe(3);
    expect(useFeynmanStore.getState().rooms[1]?.topic?.messages.length).toBe(1);
  });
});

describe("TC-STORE-FEYN-005: sendMessage SSE 定级流式", () => {
  beforeEach(() => {
    useFeynmanStore.setState({
      rooms: { 1: { topic: makeTopic(), streamingContent: "", streamingLevel: null, streamingAction: "", isStreaming: false } },
    });
  });

  it("流式收到 level + content，AI 消息带等级徽章，同步后端预算", async () => {
    // 分 3 块传输，测 buffer 拼接
    const chunks = [
      SSE_LEVEL + SSE_RESP1.slice(0, 20),
      SSE_RESP1.slice(20) + SSE_RESP2,
      SSE_DONE,
    ];
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);

    // done 后 fetchTopic 同步预算（后端返回完整历史：user + ai）
    const updated = makeTopic({
      id: 1,
      level: 2,
      messages: [
        { id: 1, role: "user", content: "React Hooks 是管理状态用的。", level: null, action: "teaching", created_at: "" },
        { id: 2, role: "ai", content: "我复述一下你的讲解", level: 2, action: "ask_example", created_at: "" },
      ],
    });
    vi.mocked(api.get).mockResolvedValue(updated);

    await useFeynmanStore.getState().sendMessage(1, "React Hooks 是管理状态用的。");

    expect(fetchMock).toHaveBeenCalledWith("/api/feynman/topics/1/message", expect.objectContaining({ method: "POST" }));

    const topic = useFeynmanStore.getState().rooms[1]!.topic!;
    // 用户 + AI 两条消息
    expect(topic.messages.length).toBe(2);
    const aiMsg = topic.messages[1];
    expect(aiMsg.role).toBe("ai");
    expect(aiMsg.level).toBe(2); // AI 消息带等级徽章
    expect(aiMsg.content).toBe("我复述一下你的讲解");

    expect(useFeynmanStore.getState().rooms[1]!.isStreaming).toBe(false);
    expect(useFeynmanStore.getState().rooms[1]!.streamingContent).toBe("");
    // done 后调用 fetchTopic 同步预算
    expect(api.get).toHaveBeenCalledWith("/api/feynman/topics/1");

    vi.unstubAllGlobals();
  });

  it("SSE 失败时 error 状态", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await useFeynmanStore.getState().sendMessage(1, "测试");
    expect(useFeynmanStore.getState().error).toBeTruthy();
    expect(useFeynmanStore.getState().rooms[1]!.isStreaming).toBe(false);
    vi.unstubAllGlobals();
  });

  it("流结束却没收到 done 帧：仍收尾（不永久卡流式态），半截回复留成消息", async () => {
    // 连接被掐断/帧丢失：只有 level + 半截 response，没有 done
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([SSE_LEVEL + SSE_RESP1])));
    vi.mocked(api.get).mockClear();

    await useFeynmanStore.getState().sendMessage(1, "React Hooks 是管理状态用的。");

    const room = useFeynmanStore.getState().rooms[1]!;
    expect(room.isStreaming).toBe(false); // 曾永久 true → 下一条消息再也发不出去
    expect(room.streamingContent).toBe("");
    const last = room.topic!.messages[room.topic!.messages.length - 1];
    expect(last.role).toBe("ai");
    expect(last.content).toBe("我复述一下"); // 半截内容不丢
    expect(api.get).not.toHaveBeenCalled(); // 没收到 done 就不该 fetchTopic
    vi.unstubAllGlobals();
  });

  it("房间隔离：一个房间的流式不影响另一个房间", async () => {
    useFeynmanStore.setState({
      rooms: {
        1: { topic: makeTopic({ id: 1 }), streamingContent: "", streamingLevel: null, streamingAction: "", isStreaming: false },
        2: { topic: makeTopic({ id: 2, name: "TypeScript" }), streamingContent: "", streamingLevel: null, streamingAction: "", isStreaming: false },
      },
    });

    const chunks = [SSE_LEVEL + SSE_RESP1 + SSE_RESP2 + SSE_DONE];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));
    // done 后 fetchTopic 从后端拿完整历史（含 AI 消息）
    vi.mocked(api.get).mockResolvedValue(
      makeTopic({
        id: 1,
        level: 2,
        messages: [
          { id: 1, role: "user", content: "React 讲解", level: null, action: "teaching", created_at: "" },
          { id: 2, role: "ai", content: "我复述一下你的讲解", level: 2, action: "ask_example", created_at: "" },
        ],
      })
    );

    await useFeynmanStore.getState().sendMessage(1, "React 讲解");

    const s = useFeynmanStore.getState();
    expect(s.rooms[1]!.topic!.messages.length).toBe(2); // 房间1收到 AI 回复
    expect(s.rooms[1]!.isStreaming).toBe(false);
    expect(s.rooms[2]!.topic!.messages.length).toBe(0); // 房间2完全没动
    expect(s.rooms[2]!.isStreaming).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("TC-STORE-FEYN-006: addProblem 手动添加问题", () => {
  beforeEach(() => {
    useFeynmanStore.setState({ rooms: { 1: { topic: makeTopic(), streamingContent: "", streamingLevel: null, streamingAction: "", isStreaming: false } } });
  });

  it("POST /api/feynman/topics/:id/problems 并 append 到该房间", async () => {
    const created = {
      id: 7, topic_id: 1, content: "useRef 返回值讲不清", source: "manual",
      status: "open" as const, created_at: "", resolved_at: null,
    };
    vi.mocked(api.post).mockResolvedValue(created);

    await useFeynmanStore.getState().addProblem(1, "useRef 返回值讲不清");
    expect(api.post).toHaveBeenCalledWith("/api/feynman/topics/1/problems", { content: "useRef 返回值讲不清" });
    expect(useFeynmanStore.getState().rooms[1]!.topic!.problems).toEqual([created]);
  });
});

describe("TC-STORE-FEYN-007: setProblemStatus 标记解决 / 重开", () => {
  beforeEach(() => {
    const p = {
      id: 7, topic_id: 1, content: "useRef 返回值讲不清", source: "manual",
      status: "open" as const, created_at: "", resolved_at: null,
    };
    useFeynmanStore.setState({
      rooms: { 1: { topic: makeTopic({ problems: [p] }), streamingContent: "", streamingLevel: null, streamingAction: "", isStreaming: false } },
    });
  });

  it("PUT 后原地更新该房间对应问题为 resolved", async () => {
    const updated = {
      id: 7, topic_id: 1, content: "useRef 返回值讲不清", source: "manual",
      status: "resolved" as const, created_at: "", resolved_at: new Date().toISOString(),
    };
    vi.mocked(api.put).mockResolvedValue(updated);

    await useFeynmanStore.getState().setProblemStatus(1, 7, "resolved");
    expect(api.put).toHaveBeenCalledWith("/api/feynman/topics/1/problems/7", { status: "resolved" });
    expect(useFeynmanStore.getState().rooms[1]!.topic!.problems[0].status).toBe("resolved");
  });

  it("重开：resolved → open", async () => {
    const reopened = {
      id: 7, topic_id: 1, content: "useRef 返回值讲不清", source: "manual",
      status: "open" as const, created_at: "", resolved_at: null,
    };
    vi.mocked(api.put).mockResolvedValue(reopened);

    await useFeynmanStore.getState().setProblemStatus(1, 7, "open");
    expect(useFeynmanStore.getState().rooms[1]!.topic!.problems[0].status).toBe("open");
  });
});
