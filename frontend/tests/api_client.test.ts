import { describe, it, expect, vi } from "vitest";
import { api } from "../core/api/client";

describe("TC-API-001: GET request", () => {
  it("should make GET request and return data", async () => {
    const mockData = [{ id: 1, title: "test" }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await api.get("/api/resumes");
    expect(result).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith("/api/resumes", expect.objectContaining({ method: "GET" }));
  });
});

describe("TC-API-002: POST request", () => {
  it("should make POST request with JSON body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await api.post("/api/resumes", { title: "test" });
    expect(result).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "test" }),
      })
    );
  });
});

describe("TC-API-003: Error response", () => {
  it("should throw on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: "Not found" }),
    });

    await expect(api.get("/api/resumes/999")).rejects.toThrow("Not found");
  });
});
