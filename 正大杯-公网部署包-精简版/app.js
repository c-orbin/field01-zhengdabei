(() => {
  "use strict";

  const DATA = window.FIELD_DATA;
  const TOPIC_PLANS = window.TOPIC_PLANS || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    year: "all",
    award: "all",
    query: "",
    visibleCount: 9,
    material: "全部",
    selectedMaterial: DATA.materials[0].id,
    source: "全部",
    topics: DATA.topics,
    headlines: DATA.headlines,
    saved: loadSaved(),
    activeModal: null,
    lastFocus: null
  };

  const caseGrid = $("[data-case-grid]");
  const emptyState = $("[data-archive-empty]");
  const resultCount = $("[data-filter-result]");
  const loadMoreButton = $("[data-load-more]");
  const materialFeature = $("[data-material-feature]");
  const materialList = $("[data-material-list]");
  const materialIndex = $("[data-material-index]");
  const topicGrid = $("[data-topic-grid]");
  const radarLoading = $("[data-radar-loading]");
  const refreshButton = $("[data-refresh]");
  const boardDrawer = $("[data-board-drawer]");
  const boardContent = $("[data-board-content]");
  const caseModal = $("[data-case-modal]");
  const caseModalContent = $("[data-case-modal-content]");
  const materialModal = $("[data-material-modal]");
  const materialModalContent = $("[data-material-modal-content]");
  const topicModal = $("[data-topic-modal]");
  const topicModalContent = $("[data-topic-modal-content]");
  const toast = $("[data-toast]");
  const floatingBoard = $(".floating-board");
  let toastTimer = 0;
  let searchTimer = 0;

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function inlineMarkdown(value) {
    return escapeHTML(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r/g, "").split("\n");
    const html = [];
    let listType = "";
    let paragraph = [];

    const closeList = () => {
      if (listType) {
        html.push(`</${listType}>`);
        listType = "";
      }
    };
    const flushParagraph = () => {
      if (paragraph.length) {
        html.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
        paragraph = [];
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^<a\s/i.test(trimmed)) {
        flushParagraph();
        closeList();
        return;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(heading[1].length + 1, 5);
        html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      if (/^>\s/.test(trimmed)) {
        flushParagraph();
        closeList();
        html.push(`<blockquote>${inlineMarkdown(trimmed.slice(1).trim())}</blockquote>`);
        return;
      }

      if (/^\|.*\|$/.test(trimmed)) {
        flushParagraph();
        closeList();
        if (/^\|[\s:|-]+\|$/.test(trimmed)) return;
        const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
        html.push(`<div class="md-table-row">${cells.map((cell) => `<span>${inlineMarkdown(cell)}</span>`).join("")}</div>`);
        return;
      }

      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = unordered ? "ul" : "ol";
        if (listType !== nextType) {
          closeList();
          html.push(`<${nextType}>`);
          listType = nextType;
        }
        html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
        return;
      }

      closeList();
      paragraph.push(trimmed);
    });

    flushParagraph();
    closeList();
    return html.join("");
  }

  function loadSaved() {
    try {
      const value = JSON.parse(localStorage.getItem("field01-saved-topics") || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function persistSaved() {
    try {
      localStorage.setItem("field01-saved-topics", JSON.stringify(state.saved));
    } catch {
      // The site still works when storage is unavailable.
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function filteredCases() {
    const query = state.query.trim().toLowerCase();
    return DATA.cases.filter((item) => {
      const yearMatch = state.year === "all" || item.year === state.year;
      const awardMatch = state.award === "all" || item.award === state.award;
      const haystack = [
        item.title,
        item.track,
        item.method,
        item.abstract,
        ...item.tags
      ].join(" ").toLowerCase();
      return yearMatch && awardMatch && (!query || haystack.includes(query));
    });
  }

  function caseCardTemplate(item, index) {
    const awardShort = { "一等奖": "一", "二等奖": "二", "三等奖": "三" }[item.award];
    return `
      <article class="case-card" tabindex="0" aria-label="打开案例：${escapeHTML(item.title)}"
        data-case-id="${escapeHTML(item.id)}"
        style="animation-delay:${Math.min(index * 45, 360)}ms">
        <div class="case-card-head">
          <span class="case-code">${escapeHTML(item.code)} / ${escapeHTML(item.year)}</span>
          <span class="case-award">国${awardShort}<small>${escapeHTML(item.award)}</small></span>
        </div>
        <div class="case-visual" aria-hidden="true"><span>METHOD / ${escapeHTML(item.method.split(" · ")[0])}</span></div>
        <div class="case-card-body">
          <h3 class="case-title">${escapeHTML(item.title)}</h3>
          <div class="case-meta">
            <span>${escapeHTML(item.track)}</span>
            <span>${escapeHTML(item.method)}</span>
          </div>
          <p class="case-description">${escapeHTML(item.abstract)}</p>
          <div class="case-footer">
            <div class="case-tags">
              ${item.tags.map((tag) => `<span class="case-tag">${escapeHTML(tag)}</span>`).join("")}
            </div>
            <button class="case-open" type="button" aria-label="查看 PPT 拆解">↗</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCases() {
    const items = filteredCases();
    const visible = items.slice(0, state.visibleCount);
    resultCount.textContent = items.length;
    caseGrid.innerHTML = visible.map(caseCardTemplate).join("");
    emptyState.hidden = items.length !== 0;
    caseGrid.hidden = items.length === 0;
    loadMoreButton.hidden = state.visibleCount >= items.length || items.length === 0;
    loadMoreButton.innerHTML = `展开更多档案 <span>↓</span>`;
  }

  function setFilter(type, value, button) {
    state[type] = value;
    state.visibleCount = 9;
    if (button) {
      const group = button.parentElement;
      $$("button", group).forEach((item) => item.classList.toggle("is-active", item === button));
    }
    renderCases();
  }

  function clearFilters() {
    state.year = "all";
    state.award = "all";
    state.query = "";
    state.visibleCount = 9;
    $("[data-case-search]").value = "";
    $$("[data-year-filters] .chip, [data-award-filters] .chip").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.year === "all" || button.dataset.award === "all");
    });
    renderCases();
  }

  function openCase(caseId) {
    const item = DATA.cases.find((entry) => entry.id === caseId);
    if (!item) return;
    state.lastFocus = document.activeElement;
    const awardShort = { "一等奖": "一", "二等奖": "二", "三等奖": "三" }[item.award];
    const slides = item.slides.map((slide, index) => `
      <div class="ppt-slide">
        <div class="ppt-slide-label">
          <span>${escapeHTML(slide.label)}</span>
          <span>${String(index + 1).padStart(2, "0")} / 04</span>
        </div>
        <strong>${escapeHTML(slide.title)}</strong>
        <span class="ppt-slide-chart" aria-hidden="true"></span>
        <small>${escapeHTML(slide.note)}</small>
      </div>
    `).join("");

    caseModalContent.innerHTML = `
      <div class="modal-eyebrow">
        <span>${escapeHTML(item.code)} / CASE STUDY / ${escapeHTML(item.year)}</span>
        <span>NATIONAL AWARD ${escapeHTML(awardShort)}</span>
      </div>
      <h2 class="modal-case-title" id="case-modal-title">${escapeHTML(item.title)}</h2>
      <p class="modal-case-note">${escapeHTML(item.abstract)}</p>
      <div class="modal-meta-row">
        <span>${escapeHTML(item.year)} 届</span>
        <span>全国${escapeHTML(item.award)}</span>
        <span>${escapeHTML(item.track)}</span>
        ${item.tags.map((tag) => `<span># ${escapeHTML(tag)}</span>`).join("")}
      </div>
      <div class="modal-case-grid">
        <div>
          <div class="ppt-preview">${slides}</div>
        </div>
        <div class="modal-analysis">
          <div class="modal-analysis-row">
            <strong>问题切口</strong>
            <p>没有停留在现象描述，而是从具体的消费情境与决策缺口开始。</p>
          </div>
          <div class="modal-analysis-row">
            <strong>研究设计</strong>
            <p>${escapeHTML(item.method)}；核心观察量为 ${escapeHTML(item.metric)}。</p>
          </div>
          <div class="modal-analysis-row">
            <strong>证据链</strong>
            <p>探索性访谈 → 可测量变量 → 主研究 → 分群解释 → 稳健性检查。</p>
          </div>
          <div class="modal-analysis-row">
            <strong>展示逻辑</strong>
            <p>每页只保留一个结论，用图表标题直接表达发现，将方法与样本放入附录。</p>
          </div>
          <div class="case-download-grid">
            <a class="case-download" href="${escapeHTML(item.originalPpt)}" download>
              <small>ORIGINAL · PPTX</small>
              <strong>下载案例原件</strong>
              <span>↓</span>
            </a>
            <a class="case-download is-breakdown" href="${escapeHTML(item.breakdownPpt)}" download>
              <small>DECONSTRUCTED · PPTX</small>
              <strong>下载拆解版</strong>
              <span>↓</span>
            </a>
          </div>
          <button class="case-copy-button" type="button" data-copy-case>复制案例摘要</button>
          <p class="case-download-note">左侧预览为拆解版结构；两个文件均为当前结构示例的独立 PPT。</p>
        </div>
      </div>
    `;

    caseModalContent.querySelector("[data-copy-case]").addEventListener("click", async () => {
      const summary = `${item.title}（${item.year} · ${item.award}）\n方法：${item.method}\n研究切口：${item.abstract}`;
      try {
        await navigator.clipboard.writeText(summary);
        showToast("案例摘要已复制");
      } catch {
        showToast("复制失败，请手动选择文本");
      }
    });

    openLayer(caseModal, true);
  }

  function openLayer(layer, lock = false) {
    state.lastFocus = state.lastFocus || document.activeElement;
    layer.classList.add("is-open");
    layer.setAttribute("aria-hidden", "false");
    if (lock) document.body.classList.add("is-locked");
    window.setTimeout(() => {
      const focusable = layer.querySelector("button, a, [tabindex]");
      if (focusable) focusable.focus({ preventScroll: true });
    }, 80);
  }

  function closeLayer(layer) {
    layer.classList.remove("is-open");
    layer.setAttribute("aria-hidden", "true");
    if (
      !caseModal.classList.contains("is-open")
      && !materialModal.classList.contains("is-open")
      && !topicModal.classList.contains("is-open")
      && !boardDrawer.classList.contains("is-open")
    ) {
      document.body.classList.remove("is-locked");
    }
    if (state.lastFocus && document.contains(state.lastFocus)) {
      state.lastFocus.focus({ preventScroll: true });
    }
    state.lastFocus = null;
  }

  function renderMaterials() {
    const visible = DATA.materials.filter((item) => state.material === "全部" || item.category === state.material);
    if (!visible.some((item) => item.id === state.selectedMaterial)) {
      state.selectedMaterial = visible[0]?.id || DATA.materials[0].id;
    }
    const selected = DATA.materials.find((item) => item.id === state.selectedMaterial) || DATA.materials[0];
    const actualIndex = DATA.materials.findIndex((item) => item.id === selected.id) + 1;

    materialIndex.textContent = `${String(actualIndex).padStart(2, "0")} / ${String(DATA.materials.length).padStart(2, "0")}`;
    materialFeature.classList.add("is-changing");
    window.setTimeout(() => {
      materialFeature.innerHTML = `
        <div class="material-feature-head">
          <span class="material-feature-type">${escapeHTML(selected.category)}</span>
          <span class="material-feature-code">${escapeHTML(selected.file)}</span>
        </div>
        <h3>${escapeHTML(selected.name)}</h3>
        <p class="material-feature-desc">${escapeHTML(selected.desc)}</p>
        <div class="material-feature-grid">
          <div><strong>USE CASE</strong><p>${escapeHTML(selected.use)}</p></div>
          <div><strong>CHECK BEFORE USE</strong><p>${escapeHTML(selected.check)}</p></div>
        </div>
        <button class="material-download" type="button" data-open-material="${escapeHTML(selected.id)}">
          站内预览素材 <span>↗</span>
        </button>
      `;
      materialFeature.classList.remove("is-changing");
    }, reduceMotion ? 0 : 130);

    materialList.innerHTML = DATA.materials.map((item, index) => `
      <button class="material-item ${item.id === selected.id ? "is-active" : ""}"
        type="button" data-material-id="${escapeHTML(item.id)}"
        ${visible.some((entry) => entry.id === item.id) ? "" : "hidden"}>
        <span class="material-item-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="material-item-name">${escapeHTML(item.name)}</span>
        <span class="material-item-icon">↗</span>
      </button>
    `).join("");
  }

  async function openMaterial(materialId) {
    const item = DATA.materials.find((entry) => entry.id === materialId);
    if (!item) return;
    const isDeck = item.category === "PPT" && /\.pptx$/i.test(item.href);
    materialModalContent.innerHTML = `
      <div class="material-modal-header">
        <div class="modal-eyebrow">
          <span>MATERIALS / ${escapeHTML(item.category)}</span>
          <span>${escapeHTML(item.file)}</span>
        </div>
        <h2 id="material-modal-title">${escapeHTML(item.name)}</h2>
        <p>${escapeHTML(item.desc)}</p>
        <div class="material-modal-actions">
          <a href="${escapeHTML(item.href)}" download>${isDeck ? "下载 PPT" : "下载源文件"} <span>↓</span></a>
          <a href="${escapeHTML(item.href)}" target="_blank" rel="noopener">${isDeck ? "在新窗口打开" : "查看纯文本"} <span>↗</span></a>
        </div>
      </div>
      <div class="material-modal-body" data-material-modal-body>
        ${isDeck ? `
          <div class="deck-preview-grid">
            ${[
              ["01", "问题与决策缺口"],
              ["02", "研究设计"],
              ["03", "样本与证据链"],
              ["04", "关键发现"],
              ["05", "行动建议"],
              ["06", "边界与复盘"]
            ].map(([num, title]) => `
              <div class="deck-preview-slide">
                <small>FIELD / 01 · ${num}</small>
                <strong>${title}</strong>
                <span aria-hidden="true"></span>
              </div>
            `).join("")}
          </div>
          <div class="material-modal-note">
            <strong>USE CASE</strong>
            <p>${escapeHTML(item.use)}</p>
            <strong>CHECK BEFORE USE</strong>
            <p>${escapeHTML(item.check)}</p>
          </div>
        ` : `
          <div class="material-modal-note">
            <strong>USE CASE</strong>
            <p>${escapeHTML(item.use)}</p>
            <strong>CHECK BEFORE USE</strong>
            <p>${escapeHTML(item.check)}</p>
          </div>
          <div data-material-document>
          <div class="markdown-loading"><span></span>正在排版素材内容...</div>
          </div>
        `}
      </div>
    `;
    openLayer(materialModal, true);

    if (!isDeck) {
      const body = materialModalContent.querySelector("[data-material-document]");
      const sourcePath = item.href.split("#")[0];
      try {
        const response = await fetch(sourcePath, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        body.innerHTML = `<article class="markdown-document">${renderMarkdown(markdown)}</article>`;
      } catch {
        body.innerHTML = `
          <div class="markdown-error">
            <strong>预览暂不可用</strong>
            <p>请使用上方“下载源文件”打开完整内容。</p>
          </div>
        `;
      }
    }
  }

  function formatUpdated(date = new Date()) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai"
    }).format(date);
  }

  function visibleTopics() {
    return state.topics.filter((item) => state.source === "全部" || item.sourceType === state.source);
  }

  function topicCardTemplate(item, index) {
    const saved = state.saved.includes(item.id);
    return `
      <article class="topic-card" tabindex="0" role="group"
        aria-label="打开完整研究方案：${escapeHTML(item.title)}"
        data-topic-open="${escapeHTML(item.id)}"
        style="animation-delay:${Math.min(index * 65, 320)}ms">
        <div class="topic-card-top">
          <span class="topic-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="topic-source"><i></i>${escapeHTML(item.sourceType)}信号</span>
        </div>
        <h3 class="topic-title">${escapeHTML(item.title)}</h3>
        <p class="topic-signal">${escapeHTML(item.signal)}</p>
        <div class="topic-source-meta">
          <span>${escapeHTML(item.sourceName)}</span>
          <span>${escapeHTML(item.published || DATA.snapshotDate)}</span>
          <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">阅读信号原文 ↗</a>
        </div>
        <div class="topic-blocks">
          <div class="topic-block">
            <strong><span>A</span> 研究角度</strong>
            <p>${escapeHTML(item.angle)}</p>
          </div>
          <div class="topic-block">
            <strong><span>D</span> 研究设计</strong>
            <p>${escapeHTML(item.design)}</p>
          </div>
        </div>
        <div class="topic-footer">
          <div class="topic-tags">
            ${item.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}
          </div>
          <div class="topic-footer-actions">
            <span class="topic-detail-cue">完整方案 <i>↗</i></span>
            <button class="save-topic ${saved ? "is-saved" : ""}" type="button" data-save-topic="${escapeHTML(item.id)}">
              ${saved ? "已收藏" : "加入选题板"}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderTopics() {
    const topics = visibleTopics();
    topicGrid.innerHTML = topics.map(topicCardTemplate).join("");
    topicGrid.hidden = topics.length === 0;
  }

  function openTopic(topicId) {
    const item = state.topics.find((entry) => entry.id === topicId)
      || DATA.topics.find((entry) => entry.id === topicId);
    const plan = TOPIC_PLANS[topicId];
    if (!item || !plan) return;

    const saved = state.saved.includes(topicId);
    topicModalContent.innerHTML = `
      <header class="topic-modal-header">
        <div class="modal-eyebrow">
          <span>RESEARCH PLAN / ${escapeHTML(item.sourceType)} SIGNAL</span>
          <span>${escapeHTML(item.published || DATA.snapshotDate)} / FIELD 01</span>
        </div>
        <div class="topic-modal-title-row">
          <span class="topic-modal-number">${escapeHTML(item.sourceType === "杂志" ? "M" : "N")}</span>
          <h2 id="topic-modal-title">${escapeHTML(item.title)}</h2>
        </div>
        <p class="topic-modal-signal">${escapeHTML(item.signal)}</p>
        <div class="topic-modal-meta">
          <span>来源 / ${escapeHTML(item.sourceName)}</span>
          <span>原文 / ${escapeHTML(item.sourceHeadline)}</span>
          <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">打开来源 ↗</a>
        </div>
      </header>

      <div class="topic-plan-overview">
        <div class="topic-score-panel">
          ${plan.scores.map(([label, value, note]) => `
            <div class="topic-score">
              <div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>
              <div class="topic-score-track"><i style="width:${Number(value)}%"></i></div>
              <p>${escapeHTML(note)}</p>
            </div>
          `).join("")}
        </div>
        <div class="topic-decision-panel">
          <span>谁可以据此做决定</span>
          <p>${escapeHTML(plan.decision)}</p>
          <div class="topic-plan-actions">
            <button class="${saved ? "is-saved" : ""}" type="button" data-topic-modal-save>
              ${saved ? "✓ 已加入选题板" : "+ 加入选题板"}
            </button>
            <button type="button" data-close-topic-modal>关闭方案</button>
          </div>
        </div>
      </div>

      <section class="topic-plan-section topic-proposition">
        <div class="plan-section-heading">
          <span>01</span>
          <div><small>PROPOSITION</small><h3>把新闻转成可检验命题</h3></div>
        </div>
        <div class="proposition-grid">
          <div class="proposition-question">
            <span>RESEARCH QUESTION</span>
            <h4>${escapeHTML(plan.question)}</h4>
            <p><strong>研究切口</strong>${escapeHTML(item.angle)}</p>
          </div>
          <div class="hypothesis-tree">
            <span>HYPOTHESES TO TEST</span>
            ${plan.hypotheses.map(([code, text]) => `
              <div class="hypothesis-item"><b>${escapeHTML(code)}</b><p>${escapeHTML(text)}</p></div>
            `).join("")}
          </div>
        </div>
      </section>

      <section class="topic-plan-section">
        <div class="plan-section-heading">
          <span>02</span>
          <div><small>EVIDENCE DESIGN</small><h3>三阶段研究设计</h3></div>
        </div>
        <div class="topic-stage-grid">
          ${plan.stages.map(([tag, title, text], index) => `
            <div class="topic-stage">
              <div><span>0${index + 1}</span><small>${escapeHTML(tag)}</small></div>
              <h4>${escapeHTML(title)}</h4>
              <p>${escapeHTML(text)}</p>
            </div>
          `).join("")}
        </div>
        <div class="sample-frame">
          <div><span>TARGET / 样本对象</span><p>${escapeHTML(plan.respondents)}</p></div>
          <div><span>SCALE / 建议规模</span><p>${escapeHTML(plan.sample)}</p></div>
        </div>
      </section>

      <section class="topic-plan-section">
        <div class="plan-section-heading">
          <span>03</span>
          <div><small>MEASUREMENT & MODEL</small><h3>变量与分析路径</h3></div>
        </div>
        <div class="variable-grid">
          ${plan.variables.map(([label, text]) => `
            <div><span>${escapeHTML(label)}</span><p>${escapeHTML(text)}</p></div>
          `).join("")}
        </div>
        <div class="design-note">
          <span>DESIGN / 具体执行</span>
          <p>${escapeHTML(item.design)}</p>
        </div>
      </section>

      <section class="topic-plan-section">
        <div class="plan-section-heading">
          <span>04</span>
          <div><small>PRESENTATION</small><h3>答辩如何讲清楚</h3></div>
        </div>
        <div class="slide-storyboard">
          ${plan.slides.map((title, index) => `
            <div class="storyboard-slide">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHTML(title)}</strong>
              <i aria-hidden="true"></i>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="topic-plan-section">
        <div class="plan-section-heading">
          <span>05</span>
          <div><small>DELIVERY & RISK</small><h3>交付物与风险控制</h3></div>
        </div>
        <div class="delivery-grid">
          <div class="delivery-output">
            <span>FINAL OUTPUT</span>
            <p>${escapeHTML(plan.output)}</p>
          </div>
          <div class="risk-list">
            ${plan.risks.map((risk, index) => `
              <div><b>R${index + 1}</b><p>${escapeHTML(risk)}</p></div>
            `).join("")}
          </div>
        </div>
      </section>

      <footer class="topic-modal-footer">
        <p>方案为备赛假设，不作为既定结论。进入田野前，请先用 5—8 位目标用户完成探索性访谈并校准问卷。</p>
        <a href="assets/case-breakdown-template.pptx" download>下载 PPT 结构模板 ↓</a>
      </footer>
    `;

    const modalSaveButton = topicModalContent.querySelector("[data-topic-modal-save]");
    modalSaveButton.addEventListener("click", () => {
      toggleSaved(topicId);
      const isSaved = state.saved.includes(topicId);
      modalSaveButton.classList.toggle("is-saved", isSaved);
      modalSaveButton.textContent = isSaved ? "✓ 已加入选题板" : "+ 加入选题板";
    });
    topicModalContent.querySelector("[data-close-topic-modal]").addEventListener("click", () => closeLayer(topicModal));
    openLayer(topicModal, true);
  }

  function renderTicker() {
    const content = state.headlines.map(([title, source, url, type]) => `
      <a class="ticker-item" href="${escapeHTML(url)}" target="_blank" rel="noopener">
        ${escapeHTML(title)} <small>${escapeHTML(type)} / ${escapeHTML(source)}</small>
      </a>
    `).join("");
    $("[data-ticker-track]").innerHTML = content + content;
  }

  function toggleSaved(topicId) {
    const index = state.saved.indexOf(topicId);
    if (index >= 0) {
      state.saved.splice(index, 1);
      showToast("已从选题板移除");
    } else {
      state.saved.push(topicId);
      showToast("已加入选题板");
    }
    persistSaved();
    renderTopics();
    renderSavedState();
    if (boardDrawer.classList.contains("is-open")) renderBoard();
  }

  function renderSavedState() {
    $$("[data-saved-count]").forEach((element) => {
      element.textContent = state.saved.length;
    });
    floatingBoard.classList.toggle("is-visible", state.saved.length > 0 || window.scrollY > 1100);
  }

  function renderBoard() {
    const savedTopics = state.saved
      .map((id) => state.topics.find((topic) => topic.id === id))
      .filter(Boolean);

    if (!savedTopics.length) {
      boardContent.innerHTML = `
        <div class="board-empty">
          <strong>00</strong>
          <p>还没有收藏选题。在选题雷达中点击“加入选题板”。</p>
        </div>
      `;
      return;
    }

    boardContent.innerHTML = savedTopics.map((item, index) => `
      <article class="board-item">
        <span class="board-item-index">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.angle)}</p>
        </div>
        <button type="button" aria-label="移除选题" data-remove-topic="${escapeHTML(item.id)}">×</button>
      </article>
    `).join("");
  }

  function openBoard() {
    renderBoard();
    openLayer(boardDrawer, true);
  }

  function applyInsights(payload) {
    if (Array.isArray(payload.topics) && payload.topics.length) {
      state.topics = payload.topics;
    }
    if (Array.isArray(payload.headlines) && payload.headlines.length) {
      state.headlines = payload.headlines;
    }
    if (payload.updatedAt) {
      const updated = new Date(payload.updatedAt);
      if (!Number.isNaN(updated.getTime())) {
        $("[data-last-updated]").textContent = formatUpdated(updated);
      }
    }
    if (payload.snapshotDate) {
      $("[data-snapshot-date]").textContent = payload.snapshotDate.replaceAll("-", ".");
    }
    renderTopics();
    renderTicker();
  }

  async function refreshRadar(manual = false) {
    if (manual) {
      radarLoading.classList.add("is-visible");
      topicGrid.hidden = true;
      refreshButton.classList.add("is-loading");
      refreshButton.disabled = true;
      $("[data-refresh]").lastChild.textContent = " 正在更新";
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch("/api/insights", {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      applyInsights(payload);
      if (manual) showToast("选题雷达已刷新");
    } catch {
      $("[data-last-updated]").textContent = formatUpdated(new Date());
      if (manual) showToast("实时源暂不可用，已使用最近快照");
    } finally {
      window.clearTimeout(timeout);
      radarLoading.classList.remove("is-visible");
      topicGrid.hidden = false;
      refreshButton.classList.remove("is-loading");
      refreshButton.disabled = false;
      refreshButton.lastChild.textContent = " 刷新雷达";
      if (!state.topics.length) renderTopics();
    }
  }

  function initRevealObserver() {
    const nodes = $$(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    nodes.forEach((node) => observer.observe(node));
  }

  function initCounters() {
    const counters = $$("[data-count]");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      counters.forEach((counter) => counter.textContent = counter.dataset.count);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const node = entry.target;
        const target = Number(node.dataset.count);
        const start = performance.now();
        const duration = 900;
        const tick = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          node.textContent = Math.round(target * eased);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.unobserve(node);
      });
    }, { threshold: 0.75 });
    counters.forEach((counter) => observer.observe(counter));
  }

  function initSectionObserver() {
    if (!("IntersectionObserver" in window)) return;
    const links = $$("[data-section-link]");
    const sections = ["archive", "materials", "radar"].map((id) => document.getElementById(id));
    const observer = new IntersectionObserver((entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      links.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${active.target.id}`);
      });
    }, { rootMargin: "-22% 0px -60% 0px", threshold: [0, 0.1, 0.4] });
    sections.forEach((section) => section && observer.observe(section));
  }

  function initHeaderAndProgress() {
    const header = $("[data-header]");
    const progress = $(".scroll-progress span");
    const update = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${maxScroll ? Math.min(window.scrollY / maxScroll, 1) : 0})`;
      floatingBoard.classList.toggle("is-visible", state.saved.length > 0 || window.scrollY > 1100);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initPosterMotion() {
    if (reduceMotion || window.matchMedia("(pointer: coarse)").matches) return;
    const poster = $("[data-poster]");
    const orbit = $("[data-orbit]");
    poster.addEventListener("pointermove", (event) => {
      const rect = poster.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      poster.style.transform = `perspective(900px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
      orbit.style.transform = `translate(calc(-50% + ${x * 7}px), calc(-50% + ${y * 7}px))`;
    });
    poster.addEventListener("pointerleave", () => {
      poster.style.transform = "";
      orbit.style.transform = "";
    });
  }

  function initMobileMenu() {
    const button = $("[data-menu-toggle]");
    const menu = $("[data-mobile-menu]");
    const setOpen = (open) => {
      button.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      document.body.classList.toggle("is-locked", open);
    };
    button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
    $$("a", menu).forEach((link) => link.addEventListener("click", () => setOpen(false)));
  }

  function initEvents() {
    $("[data-year-filters]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-year]");
      if (button) setFilter("year", button.dataset.year, button);
    });

    $("[data-award-filters]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-award]");
      if (button) setFilter("award", button.dataset.award, button);
    });

    $("[data-case-search]").addEventListener("input", (event) => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = event.target.value;
        state.visibleCount = 9;
        renderCases();
      }, 140);
    });

    $$("[data-clear-filters]").forEach((button) => button.addEventListener("click", clearFilters));

    loadMoreButton.addEventListener("click", () => {
      state.visibleCount += 9;
      renderCases();
      const cards = $$(".case-card", caseGrid);
      cards[Math.max(0, cards.length - 9)]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });

    caseGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-case-id]");
      if (card) openCase(card.dataset.caseId);
    });

    caseGrid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-case-id]");
      if (card) {
        event.preventDefault();
        openCase(card.dataset.caseId);
      }
    });

    $("[data-material-tabs]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-material]");
      if (!button) return;
      state.material = button.dataset.material;
      $$(".material-tab").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      renderMaterials();
    });

    materialList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-material-id]");
      if (!button) return;
      state.selectedMaterial = button.dataset.materialId;
      renderMaterials();
    });

    materialFeature.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-material]");
      if (button) openMaterial(button.dataset.openMaterial);
    });

    $("[data-source-filters]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-source]");
      if (!button) return;
      state.source = button.dataset.source;
      $$("[data-source-filters] button").forEach((item) => item.classList.toggle("is-active", item === button));
      renderTopics();
    });

    refreshButton.addEventListener("click", () => refreshRadar(true));

    topicGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-save-topic]");
      if (button) {
        event.stopPropagation();
        toggleSaved(button.dataset.saveTopic);
        return;
      }
      if (event.target.closest("a")) return;
      const card = event.target.closest("[data-topic-open]");
      if (card) openTopic(card.dataset.topicOpen);
    });

    topicGrid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("a, button")) return;
      const card = event.target.closest("[data-topic-open]");
      if (card) {
        event.preventDefault();
        openTopic(card.dataset.topicOpen);
      }
    });

    boardContent.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-topic]");
      if (button) toggleSaved(button.dataset.removeTopic);
    });

    $$("[data-open-board]").forEach((button) => button.addEventListener("click", openBoard));
    $$("[data-close-board]").forEach((button) => button.addEventListener("click", () => closeLayer(boardDrawer)));
    $$("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeLayer(caseModal)));
    $$("[data-close-material-modal]").forEach((button) => button.addEventListener("click", () => closeLayer(materialModal)));
    $$("[data-close-topic-modal]").forEach((button) => button.addEventListener("click", () => closeLayer(topicModal)));

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (caseModal.classList.contains("is-open")) closeLayer(caseModal);
      if (materialModal.classList.contains("is-open")) closeLayer(materialModal);
      if (topicModal.classList.contains("is-open")) closeLayer(topicModal);
      if (boardDrawer.classList.contains("is-open")) closeLayer(boardDrawer);
    });
  }

  function init() {
    renderCases();
    renderMaterials();
    renderTopics();
    renderTicker();
    renderSavedState();
    initRevealObserver();
    initCounters();
    initSectionObserver();
    initHeaderAndProgress();
    initPosterMotion();
    initMobileMenu();
    initEvents();
    $("[data-last-updated]").textContent = formatUpdated(new Date());
    $("[data-snapshot-date]").textContent = DATA.snapshotDate.replaceAll("-", ".");
    window.setTimeout(() => refreshRadar(false), 850);
  }

  init();
})();
