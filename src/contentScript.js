(() => {
  const { fetchCardPrices, normalizeText } = window.CardRushAPI;
  const UI = window.CardRushUI;

  function isDetailPage() {
    return /\/card-search\/details\.php/i.test(location.pathname);
  }

  function isSearchPage() {
    return /\/card-search(?:\/|$)/i.test(location.pathname);
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
    let activeHoverTarget = null;

    const getHoverTarget = (node) => {
      if (!node) return null;
      const detailAnchor = node.closest?.("a[href*='/card-search/details.php']");
      if (!detailAnchor) return null;
      return detailAnchor.closest("li, .card, .card-item, .result-card") || detailAnchor;
    };

    document.addEventListener("mouseover", async (ev) => {
      const hoverTarget = getHoverTarget(ev.target);
      if (!hoverTarget || hoverTarget === activeHoverTarget) return;
      activeHoverTarget = hoverTarget;

      const cardName = findCardNameNearElement(hoverTarget);
      if (!cardName) return;

      UI.showHoverPop(ev.clientX, ev.clientY);
      UI.setHoverLoading();

      try {
        const data = await fetchCardPrices(cardName);
        if (activeHoverTarget !== hoverTarget) return;
        if (!data?.items?.length) UI.setHoverError("CardRushで該当商品が見つかりませんでした");
        else UI.setHoverData(data);
      } catch (err) {
        if (activeHoverTarget !== hoverTarget) return;
        UI.setHoverError("価格情報を取得できませんでした");
        console.warn("[CardRush] hover fetch error:", err);
      }
    });

    document.addEventListener("mousemove", (ev) => {
      const hoverTarget = getHoverTarget(ev.target);
      if (!hoverTarget) return;
      UI.showHoverPop(ev.clientX, ev.clientY);
    });

    document.addEventListener("mouseout", (ev) => {
      const hoverTarget = getHoverTarget(ev.target);
      if (!hoverTarget) return;
      const next = ev.relatedTarget;
      if (next && hoverTarget.contains(next)) return;
      if (activeHoverTarget === hoverTarget) activeHoverTarget = null;
      UI.scheduleHideHoverPop(400);
    });
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
