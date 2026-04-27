(() => {
  const { fetchCardPrices, normalizeText } = window.CardRushAPI;
  const UI = window.CardRushUI;

  function isDetailPage() {
    return /\/card-search\/details\.php/i.test(location.pathname);
  }

  function isSearchPage() {
    return /\/card-search\/index\.php/i.test(location.pathname);
  }

  function extractCardNameFromDetail() {
    // 多策略兜底，避免过度硬编码
    const candidates = [
      "h1", ".CardName", ".cardName", ".name", ".detail h2", ".l-main h1"
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const txt = normalizeText(el?.textContent || "");
      if (txt && txt.length <= 80) return txt;
    }

    // 从页面文本中兜底抽取（风险低频）
    const title = normalizeText(document.title || "");
    if (title) {
      const cleaned = title.replace(/ポケモンカードゲーム公式ホームページ.*/i, "").trim();
      if (cleaned) return cleaned;
    }
    return "";
  }

  async function runDetailPage() {
    const panel = UI.mountDetailPanel();
    UI.setPanelLoading(panel);

    const cardName = extractCardNameFromDetail();
    if (!cardName) {
      UI.setPanelError(panel, "カード名を取得できませんでした");
      return;
    }

    try {
      const data = await fetchCardPrices(cardName);
      if (!data?.items?.length) {
        UI.setPanelError(panel, "CardRushで該当商品が見つかりませんでした");
        return;
      }
      UI.setPanelData(panel, data);
    } catch (err) {
      UI.setPanelError(panel, "価格情報を取得できませんでした");
      console.warn("[CardRush] detail fetch error:", err);
    }
  }

  function findCardNameNearElement(el) {
    if (!el) return "";

    const detailAnchor = el.matches?.('a[href*="/card-search/details.php"]')
      ? el
      : el.querySelector?.('a[href*="/card-search/details.php"]');

    const titleInCard = el.querySelector?.(".card-list__item-name, .CardName, .cardName, .name, .title");
    const textCandidates = [
      detailAnchor?.dataset?.name,
      detailAnchor?.dataset?.cardName,
      titleInCard?.textContent,
      el.getAttribute("alt"),
      el.getAttribute("title"),
      el.dataset?.name,
      el.dataset?.cardName,
      detailAnchor?.querySelector?.("img")?.getAttribute("alt"),
      el.querySelector?.("img")?.getAttribute("alt"),
      el.querySelector?.(".name,.card-name,.title")?.textContent,
      detailAnchor?.textContent
    ];

    for (const raw of textCandidates) {
      const t = normalizeText(raw || "");
      if (!t || t.length > 80) continue;
      // 排除明显不是卡名的文案
      if (/詳細|検索|ページ|ポケモンカードゲーム公式ホームページ/i.test(t)) continue;
      return t;
    }
    return "";
  }

  function bindSearchHover() {
    const cardNodes = document.querySelectorAll("a[href*='/card-search/details.php']");
    const bound = new WeakSet();

    const bindOne = (node) => {
      if (!node || bound.has(node)) return;
      const hoverTarget = node.closest("li, .card, .card-item, .result-card") || node;
      if (bound.has(hoverTarget)) return;
      bound.add(hoverTarget);

      hoverTarget.addEventListener("mouseenter", async (ev) => {
        const cardName = findCardNameNearElement(hoverTarget);
        if (!cardName) return;

        UI.showHoverPop(ev.clientX, ev.clientY);
        UI.setHoverLoading();

        try {
          const data = await fetchCardPrices(cardName);
          if (!data?.items?.length) UI.setHoverError("CardRushで該当商品が見つかりませんでした");
          else UI.setHoverData(data);
        } catch (err) {
          UI.setHoverError("価格情報を取得できませんでした");
          console.warn("[CardRush] hover fetch error:", err);
        }
      });

      hoverTarget.addEventListener("mousemove", (ev) => {
        UI.showHoverPop(ev.clientX, ev.clientY);
      });

      hoverTarget.addEventListener("mouseleave", () => {
        UI.scheduleHideHoverPop(400);
      });
    };

    cardNodes.forEach(bindOne);

    // 动态列表兼容
    const mo = new MutationObserver(() => {
      const nodes = document.querySelectorAll("a[href*='/card-search/details.php']");
      nodes.forEach(bindOne);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    if (isDetailPage()) {
      await runDetailPage();
      return;
    }
    if (isSearchPage()) {
      bindSearchHover();
    }
  }

  init();
})();
