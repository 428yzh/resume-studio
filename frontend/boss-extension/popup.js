// Popup — 检测后端连接状态
document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("statusText");
  if (!statusText) return;

  fetch("http://localhost:8001/health", { signal: AbortSignal.timeout(3000) })
    .then((r) => r.json())
    .then((data) => {
      if (data.status === "ok") {
        statusText.textContent = "后端已连接 ✅";
      } else {
        statusText.textContent = "后端状态异常";
      }
    })
    .catch(() => {
      statusText.textContent = "后端未启动 ❌";
      document.querySelector(".status-dot")?.classList.replace("bg-green", "bg-red");
    });
});
