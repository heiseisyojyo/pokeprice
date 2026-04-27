(() => {
  function createPanel() {
    const panel = document.createElement("section");
    panel.className = "cr-price-panel";
    panel.innerHTML = `
      <div class="cr-header">CardRush 価格情報</div>
      <div class="cr-body">CardRush価格を取得中...</div>
    `;
    return panel;
  }

  function renderItems(items) {
    if (!items || !items.length) {
      return `<div class="cr-empty">CardRushで該当商品が見つかりませんでした</div>`;
    }

    const rows = items
      .map((it) => {
        const stockClass = it.inStock ? "in" : "out";
        const cond = it.condition && it.condition !== "通常" ? `<span class="cr-cond">(${it.condition})</span>` : "";
        const price = it.priceText || (it.price != null ? `${it.price}円` : "-");
        return `
          <tr>
            <td class="rarity">${it.rarity || "その他"}</td>
            <td class="title"><a href="${it.url}" target="_blank" rel="noopener noreferrer">${it.title || "-"}</a> ${cond}</td>
            <td class="price">${price}</td>
            <td class="stock ${stockClass}">${it.stockStatus || "-"}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="cr-table-wrap">
        <table class="cr-table">
          <thead>
            <tr><th>Ver</th><th>商品</th><th>価格</th><th>在庫</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function setPanelLoading(panel) {
    panel.querySelector(".cr-body").textContent = "CardRush価格を取得中...";
  }

  function setPanelError(panel, msg = "価格情報を取得できませんでした") {
    panel.querySelector(".cr-body").innerHTML = `<div class="cr-error">${msg}</div>`;
  }

  function setPanelData(panel, data) {
    panel.querySelector(".cr-body").innerHTML = renderItems(data.items);
  }

  function ensureDetailMountPoint() {
    // 尽量稳健：优先卡牌详情主区域
    const candidates = [
      ".detail", ".cardDetail", ".contents", ".content", "main", "#contents", "#wrapper"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.body;
  }

  function mountDetailPanel() {
    let panel = document.querySelector(".cr-price-panel");
    if (panel) return panel;
    panel = createPanel();

    const mountPoint = ensureDetailMountPoint();
    mountPoint.insertBefore(panel, mountPoint.firstChild);
    return panel;
  }

  function createHoverPopover() {
    const pop = document.createElement("div");
    pop.className = "cr-hover-pop";
    pop.innerHTML = `<div class="cr-header">CardRush 価格情報</div><div class="cr-body">CardRush価格を取得中...</div>`;
    document.body.appendChild(pop);
    return pop;
  }

  let hoverPop = null;
  let closeTimer = null;

  function getHoverPop() {
    if (!hoverPop) {
      hoverPop = createHoverPopover();
      hoverPop.addEventListener("mouseenter", () => {
        if (closeTimer) clearTimeout(closeTimer);
      });
      hoverPop.addEventListener("mouseleave", () => scheduleHideHoverPop(350));
    }
    return hoverPop;
  }

  function showHoverPop(x, y) {
    const pop = getHoverPop();
    pop.style.display = "block";
    pop.style.left = `${Math.min(x + 16, window.innerWidth - 420)}px`;
    pop.style.top = `${Math.min(y + 16, window.innerHeight - 380)}px`;
  }

  function scheduleHideHoverPop(delay = 350) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (hoverPop) hoverPop.style.display = "none";
    }, delay);
  }

  function setHoverLoading() {
    const pop = getHoverPop();
    pop.querySelector(".cr-body").textContent = "CardRush価格を取得中...";
  }

  function setHoverError(msg = "価格情報を取得できませんでした") {
    const pop = getHoverPop();
    pop.querySelector(".cr-body").innerHTML = `<div class="cr-error">${msg}</div>`;
  }

  function setHoverData(data) {
    const pop = getHoverPop();
    pop.querySelector(".cr-body").innerHTML = renderItems(data.items);
  }

  window.CardRushUI = {
    mountDetailPanel,
    setPanelLoading,
    setPanelError,
    setPanelData,
    showHoverPop,
    scheduleHideHoverPop,
    setHoverLoading,
    setHoverError,
    setHoverData
  };
})();
