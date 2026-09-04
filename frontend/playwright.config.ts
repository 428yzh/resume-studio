import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cd ../backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001",
      port: 8001,
      cwd: "../backend",
      reuseExistingServer: true,
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      cwd: ".",
      reuseExistingServer: true,
    },
  ],
});
