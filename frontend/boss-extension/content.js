// Content Script — BOSS直聘 职位页面注入
// 职责：注入"导入到 Resume Pro"按钮 + 匹配度浮标

(function () {
  "use strict";

  const CURRENT_URL = window.location.href;
  const IS_JOB_DETAIL = CURRENT_URL.includes("/job_detail/");

  /* ─── 工具函数 ─── */
  function waitForElement(selector, timeout = 4000) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) return resolve(document.querySelector(selector));
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  /* ─── 提取 JD 数据 ─── */
  function extractJobData() {
    // BOSS 职位详情页的选择器（可能随页面改版变化）
    const selectors = {
      jd: [
        '.job-detail .job-sec-text',
        '.job-detail .job-description',
        '[class*="job-detail"] [class*="text"]',
        '.job-sec-text',
        '.job-description',
      ],
      company: [
        '.job-detail .company-name',
        '.job-primary .company-text',
        '.name-text',
        '.company-info .company-name',
      ],
      position: [
        '.job-detail .job-name',
        '.job-primary .job-name',
        'h1',
        '.job-title',
      ],
    };

    const jdEl = selectors.jd.reduce((found, s) => found || document.querySelector(s), null);
    const companyEl = selectors.company.reduce((found, s) => found || document.querySelector(s), null);
    const positionEl = selectors.position.reduce((found, s) => found || document.querySelector(s), null);

    return {
      jdText: jdEl ? jdEl.textContent.trim() : '',
      company: companyEl ? companyEl.textContent.trim() : '',
      position: positionEl ? positionEl.textContent.trim() : '',
    };
  }

  /* ─── 注入导入按钮 ─── */
  function injectImportButton() {
    if (!IS_JOB_DETAIL) return;

    waitForElement('.job-sec-text, .job-description, [class*="job-detail"]', 5000).then(() => {
      const { jdText, company, position } = extractJobData();
      if (!jdText) return; // 无法提取，放弃

      const container = document.createElement("div");
      container.innerHTML = `
        <button class="rp-import-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          导入到 Resume Pro
        </button>
      `;
      document.body.appendChild(container);

      container.querySelector("button")?.addEventListener("click", () => {
        const btn = container.querySelector("button");
        if (btn) {
          btn.textContent = "导入中...";
          btn.disabled = true;
        }

        chrome.runtime.sendMessage(
          {
            type: "ANALYZE_JD",
            jobUrl: CURRENT_URL,
            jdText,
            company,
            position,
          },
          (response) => {
            if (response && response.success) {
              window.open(
                `http://localhost:5173/jd?analysis_id=${response.data.id}&from=boss`,
                "_blank"
              );
            } else {
              alert("导入失败，请确认 Resume Pro 已启动 (http://localhost:5173)");
              if (btn) {
                btn.textContent = "导入到 Resume Pro";
                btn.disabled = false;
              }
            }
          }
        );
      });
    });
  }

  /* ─── 匹配度浮标 ─── */
  function injectMatchBadge() {
    chrome.runtime.sendMessage(
      { type: "CHECK_ANALYSIS", jobUrl: CURRENT_URL },
      (response) => {
        if (response && response.exists && response.summary) {
          const s = response.summary;
          if (s.total_required === 0) return;

          const pct = s.match_percentage;
          const color = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
          const label = pct >= 80 ? "高度匹配" : pct >= 50 ? "部分匹配" : "差距较大";

          const badge = document.createElement("div");
          badge.className = "rp-match-badge";
          badge.innerHTML = `
            <div class="rp-badge-inner" style="background:${color}">
              <span class="rp-badge-pct">${pct}%</span>
              <span class="rp-badge-label">${label}</span>
              <span class="rp-badge-sub">${s.match_count}/${s.total_required} 技能</span>
            </div>
          `;
          document.body.appendChild(badge);
        }
      }
    );
  }

  /* ─── 启动 ─── */
  // 给 SPA 一点时间渲染
  setTimeout(() => {
    injectImportButton();
    injectMatchBadge();
  }, 2000);
})();
