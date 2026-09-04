import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@core": path.resolve(__dirname, "core"),
      "@web": path.resolve(__dirname, "web"),
    },
  },
  server: {
    port: 5173,
    // Windows 上 localhost 会解析成 IPv6 [::1]，导致 HMR WebSocket 连不上（HTTP 通、WS 断）。
    // 强制绑 IPv4，HTTP 与 HMR WebSocket 走同一接口。访问用 http://127.0.0.1:5173
    host: "127.0.0.1",
    proxy: {
      "/api": "http://localhost:8001",
      "/health": "http://localhost:8001",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
