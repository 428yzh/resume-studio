// Background Service Worker
// 桥接 content script 与 localhost:8001 后端，绕过 CORS

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_JD") {
    fetch("http://localhost:8001/api/jd/from-boss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_url: request.jobUrl,
        jd_text: request.jdText,
        company: request.company,
        position: request.position,
      }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (request.type === "CHECK_ANALYSIS") {
    const url = encodeURIComponent(request.jobUrl);
    fetch(`http://localhost:8001/api/jd/by-url/summary?url=${url}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => sendResponse({ exists: !!data, summary: data }))
      .catch(() => sendResponse({ exists: false }));
    return true;
  }
});
