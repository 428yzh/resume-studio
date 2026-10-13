/**
 * TC-STORE-CHAT：问一问（每单元一个会话）
 *
 * 会话只在内存里（结论 3）；open 开场 / ask 续聊 / retry 替换失败的那一轮（结论 19）。
 * SSE 事件形状 {content, done}，失败在收尾事件或 HTTP 状态上体现。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { chatRoomKey, useChatStore } from "../core/stores/chatStore";

/** 构造带 SSE 流的 Response（同 feynman_store.test.ts 的写法） */
function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const evt = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
const OPEN_AI = evt({ content: "你写的是消息驱动", done: false });
const DONE = evt({ content: "", done: true });

function roomOf(skillId: number, unitKey: string) {
  return useChatStore.getState().rooms[chatRoomKey(skillId, unitKey)];
}

describe("TC-STORE-CHAT 问一问 store", () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("TC-STORE-CHAT-001: open 以 messages: [] 开场，流式收字落成 AI 消息（含半包分片）", async () => {
    // 故意把一条事件拆成两半发，验证缓冲区拼接
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([OPEN_AI.slice(0, 12), OPEN_AI.slice(12), DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/skills/1/notes/chat");
    expect(JSON.parse(init.body)).toEqual({ unit_key: "4", messages: [] });

    const room = roomOf(1, "4")!;
    expect(room.opened).toBe(true);
    expect(room.streaming).toBe(false);
    expect(room.error).toBeNull();
    expect(room.messages).toEqual([{ role: "ai", content: "你写的是消息驱动" }]);
  });

  it("TC-STORE-CHAT-002: 开过的会话再点开零请求（结论 16）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([OPEN_AI, DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");
    fetchMock.mockClear();
    await useChatStore.getState().open(1, "4");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-STORE-CHAT-003: 会话按单元隔离（结论 4）", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([evt({ content: "四号的", done: false }), DONE]))
      .mockResolvedValueOnce(sseResponse([evt({ content: "五号的", done: false }), DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");
    await useChatStore.getState().open(1, "5");

    expect(roomOf(1, "4")!.messages[0].content).toBe("四号的");
    expect(roomOf(1, "5")!.messages[0].content).toBe("五号的");
  });

  it("TC-STORE-CHAT-004: 开场失败 → error 用 FastAPI detail、opened 保持 false；重试后开场成功", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "这块还没有笔记" }), { status: 400 }))
      .mockResolvedValueOnce(sseResponse([OPEN_AI, DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");
    let room = roomOf(1, "4")!;
    expect(room.error).toBe("这块还没有笔记");
    expect(room.opened).toBe(false);
    expect(room.messages).toEqual([]); // 空气泡被撤掉，不留空消息

    await useChatStore.getState().retry(1, "4");
    room = roomOf(1, "4")!;
    expect(room.error).toBeNull();
    expect(room.opened).toBe(true);
    expect(room.messages).toEqual([{ role: "ai", content: "你写的是消息驱动" }]);
  });

  it("TC-STORE-CHAT-005: 中途断流保留半截文字；重试替换半截而不是重复追加（结论 19）", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([OPEN_AI, DONE]))
      .mockResolvedValueOnce(sseResponse([
        evt({ content: "半截", done: false }),
        evt({ content: "", done: true, error: "AI 回复失败: boom" }),
      ]))
      .mockResolvedValueOnce(sseResponse([evt({ content: "完整回复", done: false }), DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");
    await useChatStore.getState().ask(1, "4", "问题A");
    let room = roomOf(1, "4")!;
    expect(room.messages.map((m) => m.content)).toEqual(["你写的是消息驱动", "问题A", "半截"]);
    expect(room.error).toContain("boom");

    await useChatStore.getState().retry(1, "4");
    room = roomOf(1, "4")!;
    // 重发的历史里没有那半截
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).messages).toEqual([
      { role: "ai", content: "你写的是消息驱动" },
      { role: "user", content: "问题A" },
    ]);
    expect(room.messages.map((m) => m.content)).toEqual(["你写的是消息驱动", "问题A", "完整回复"]);
    expect(room.error).toBeNull();
  });

  it("TC-STORE-CHAT-006: ask 把完整历史交给服务端（服务端无状态，结论 10）", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([OPEN_AI, DONE]))
      .mockResolvedValueOnce(sseResponse([evt({ content: "嗯", done: false }), DONE]));
    vi.stubGlobal("fetch", fetchMock);

    await useChatStore.getState().open(1, "4");
    await useChatStore.getState().ask(1, "4", "问题A");

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      unit_key: "4",
      messages: [
        { role: "ai", content: "你写的是消息驱动" },
        { role: "user", content: "问题A" },
      ],
    });
  });
});
