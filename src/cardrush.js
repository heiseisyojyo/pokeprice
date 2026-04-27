(() => {
  const CARDRUSH_BASE = "https://www.cardrush-pokemon.jp";
  const SEARCH_PATH = "/product-list";

  const RARITY_LIST = [
    "MUR", "PROMO", "SAR", "CSR", "CHR", "SSR", "RRR", "RR", "SR", "UR", "HR",
    "AR", "C", "U", "R", "S", "K"
  ];

  const BAD_CONDITION_PATTERNS = [
    /(?:^|\s)A-\b/i,
    /(?:^|\s)B\b/i,
    /(?:^|\s)C\b/i,
    /状態A-/i,
    /状態B/i,
    /状態C/i,
    /傷あり/i,
    /キズあり/i,
    /プレイ用/i,
    /状態難/i
  ];

  const GOOD_CONDITION_PATTERNS = [
    /状態表記なし/i,
    /通常品/i,
    /美品/i,
    /状態A(?!-)/i
  ];

  const SOLDOUT_PATTERNS = [/売り切れ/i, /品切れ/i, /在庫なし/i, /sold\s*out/i];
  const INSTOCK_PATTERNS = [/在庫あり/i, /カートに入れる/i, /購入する/i];

  const inflightMap = new Map();
  let debounceTimer = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function debouncePromise(fn, wait = 150) {
    return new Promise((resolve, reject) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      }, wait);
    });
  }

  function normalizeText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(text) {
    const raw = normalizeText(text);
    const m = raw.match(/(?:￥|¥)?\s*([\d,]+)\s*円?/);
    if (!m) return { price: null, priceText: raw || "-" };
    const price = Number(m[1].replace(/,/g, ""));
    return { price: Number.isFinite(price) ? price : null, priceText: `${m[1]}円` };
  }

  function extractPriceFromBlock(block) {
    if (!block) return { price: null, priceText: "-" };

    const selectors = [
      "#pricech",
      ".selling_price .figure",
      ".selling_price",
      ".price_section .figure",
      ".price_section",
      ".detail_section.price .figure",
      ".detail_section.price"
    ];

    for (const sel of selectors) {
      const el = block.querySelector(sel);
      const txt = normalizeText(el?.textContent || "");
      if (!txt) continue;
      const parsed = parsePrice(txt);
      if (parsed.price != null) return parsed;
    }

    return { price: null, priceText: "-" };
  }

  function detectCondition(title) {
    const t = normalizeText(title);
    for (const p of BAD_CONDITION_PATTERNS) {
      if (p.test(t)) return { condition: extractConditionLabel(t) || "傷あり", rank: 2 };
    }
    for (const p of GOOD_CONDITION_PATTERNS) {
      if (p.test(t)) return { condition: "通常", rank: 0 };
    }
    return { condition: "通常", rank: 0 };
  }

  function extractConditionLabel(title) {
    const t = normalizeText(title);
    const labels = ["A-", "B", "C", "状態A-", "状態B", "状態C", "傷あり", "キズあり", "プレイ用", "状態難"];
    return labels.find((x) => t.includes(x)) || "";
  }

  function detectStock(text, block) {
    const t = normalizeText(text);
    if (SOLDOUT_PATTERNS.some((p) => p.test(t))) return { inStock: false, stockStatus: "在庫なし" };
    if (INSTOCK_PATTERNS.some((p) => p.test(t))) return { inStock: true, stockStatus: "在庫あり" };

    // 结构兜底：disabled / sold out class 常见于电商模板
    const stockEl = block?.querySelector?.(".detail_section.stock, .stock");
    const stockClass = normalizeText(stockEl?.className || "");
    const stockText = normalizeText(stockEl?.textContent || "");
    if (/soldout|sold-out/i.test(stockClass) || /^×$/.test(stockText)) {
      return { inStock: false, stockStatus: "在庫なし" };
    }
    if (/在庫数\s*\d+\s*枚/i.test(stockText)) {
      return { inStock: true, stockStatus: stockText };
    }

    const actionEl = block?.querySelector?.(
      'button, .cart, .add-to-cart, .ec-blockBtn--action, .ec-productRole__btn'
    );
    const classText = normalizeText(actionEl?.className || "");
    const disabledAttr =
      actionEl?.getAttribute?.("disabled") != null ||
      actionEl?.getAttribute?.("aria-disabled") === "true";
    if (disabledAttr || /disabled|soldout|sold-out/i.test(classText)) {
      return { inStock: false, stockStatus: "在庫なし" };
    }

    return { inStock: false, stockStatus: "在庫確認不可" };
  }

  function detectStockFromDetailHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const detailStockEl = doc.querySelector(".detail_section.stock, .stock");
    const detailStockClass = normalizeText(detailStockEl?.className || "");
    const detailStockText = normalizeText(detailStockEl?.textContent || "");
    if (/soldout|sold-out/i.test(detailStockClass) || /^×$/.test(detailStockText)) {
      return { inStock: false, stockStatus: "在庫なし" };
    }
    if (/在庫数\s*\d+\s*枚/i.test(detailStockText)) {
      return { inStock: true, stockStatus: detailStockText };
    }

    const pageText = normalizeText(doc.body?.textContent || "");
    if (SOLDOUT_PATTERNS.some((p) => p.test(pageText))) {
      return { inStock: false, stockStatus: "在庫なし" };
    }

    const actionEl = doc.querySelector(
      'button, input[type="submit"], .cart, .add-to-cart, .ec-productRole__btn, .ec-blockBtn--action'
    );
    const actionText = normalizeText(actionEl?.textContent || actionEl?.value || "");
    const classText = normalizeText(actionEl?.className || "");
    const disabledAttr =
      actionEl?.getAttribute?.("disabled") != null ||
      actionEl?.getAttribute?.("aria-disabled") === "true";

    if (disabledAttr || /disabled|soldout|sold-out/i.test(classText)) {
      return { inStock: false, stockStatus: "在庫なし" };
    }
    if (INSTOCK_PATTERNS.some((p) => p.test(actionText)) || /cart|add/i.test(classText)) {
      return { inStock: true, stockStatus: "在庫あり" };
    }
    return { inStock: false, stockStatus: "在庫確認不可" };
  }

  function detectRarity(title) {
    const t = normalizeText(title);
    for (const r of RARITY_LIST) {
      const reg = new RegExp(`(?:\\(|\\s|\\[|【|「|^|/)${r}(?:\\)|\\s|\\]|】|」|$|/)`, "i");
      if (reg.test(t)) return r.toUpperCase();
    }
    return "その他";
  }

  function makeSearchUrl(cardName) {
    const q = encodeURIComponent(cardName);
    return `${CARDRUSH_BASE}${SEARCH_PATH}?keyword=${q}`;
  }

  async function fetchHtml(url) {
    // try direct first
    try {
      const res = await fetch(url, { method: "GET", credentials: "omit" });
      if (res.ok) return await res.text();
    } catch (_) {
      // fallback to background
    }

    const bg = await chrome.runtime.sendMessage({ type: "CARDRUSH_FETCH", url });
    if (!bg || !bg.ok) {
      throw new Error(bg?.error || `HTTP error: ${bg?.status || "unknown"}`);
    }
    return bg.text;
  }

  function parseListPage(html, cardName) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const items = [];

    // 尽量宽松：抓取含有商品链接和价格文本的块
    const productLinks = [...doc.querySelectorAll('a[href*="/product/"], a[href*="/product-detail"], a[href*="/item/"]')];

    for (const a of productLinks) {
      const block = a.closest("li, .item, .product, .product-item, .p-item, .ec-productRole__list-item") || a.parentElement;
      const title = normalizeText(a.textContent || block?.querySelector("h3,h4,.name,.product-name")?.textContent || "");
      if (!title) continue;

      const combinedText = normalizeText(block?.textContent || title);
      if (!isLikelySameCard(cardName, title, combinedText)) continue;

      let priceInfo = extractPriceFromBlock(block);
      if (priceInfo.price == null) {
        priceInfo = parsePrice(combinedText);
      }
      if (priceInfo.price === null && !/円/.test(combinedText)) continue;

      const stock = detectStock(combinedText, block);
      const { condition, rank } = detectCondition(title + " " + combinedText);
      const rarity = detectRarity(title);

      const href = a.getAttribute("href") || "";
      const url = href.startsWith("http") ? href : `${CARDRUSH_BASE}${href.startsWith("/") ? "" : "/"}${href}`;

      items.push({
        rarity,
        title,
        price: priceInfo.price,
        priceText: priceInfo.priceText,
        condition,
        conditionRank: rank,
        stockStatus: stock.stockStatus,
        inStock: stock.inStock,
        url
      });
    }

    return dedupeAndAggregate(items, cardName);
  }

  function simplifyForMatch(text) {
    return normalizeText(text)
      .toLowerCase()
      .replace(/[【】\[\]（）()「」『』]/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildNameTokens(cardName) {
    const s = simplifyForMatch(cardName);
    if (!s) return [];
    return s
      .split(" ")
      .filter((x) => x.length >= 2)
      .slice(0, 4);
  }

  function isLikelySameCard(cardName, title, fullText) {
    const tokens = buildNameTokens(cardName);
    if (!tokens.length) return true;

    const hay = `${simplifyForMatch(title)} ${simplifyForMatch(fullText)}`;
    const hit = tokens.filter((t) => hay.includes(t)).length;
    // 至少命中一半 token，避免同名前后缀误匹配
    return hit >= Math.ceil(tokens.length / 2);
  }

  function scoreItem(item, cardName) {
    let score = 0;
    if (item.conditionRank === 0) score += 30;
    if (item.conditionRank === 1) score += 20;
    if (item.conditionRank >= 2) score += 5;
    if (item.inStock) score += 10;
    if (item.price != null) score += 10;
    if ((item.title || "").includes(cardName)) score += 15;
    if (item.rarity !== "その他") score += 10;
    return score;
  }

  function dedupeAndAggregate(items, cardName) {
    const byRarity = new Map();

    for (const item of items) {
      if (!byRarity.has(item.rarity)) byRarity.set(item.rarity, []);
      byRarity.get(item.rarity).push(item);
    }

    const result = [];
    for (const [rarity, list] of byRarity.entries()) {
      list.sort((a, b) => {
        const sa = scoreItem(a, cardName);
        const sb = scoreItem(b, cardName);
        if (sb !== sa) return sb - sa;
        const pa = a.price ?? Number.MAX_SAFE_INTEGER;
        const pb = b.price ?? Number.MAX_SAFE_INTEGER;
        return pa - pb;
      });
      result.push(list[0]);
    }

    const rarityOrder = ["PROMO", "MUR", "SAR", "CSR", "CHR", "SSR", "UR", "HR", "SR", "AR", "RRR", "RR", "R", "U", "C", "S", "K", "その他"];
    result.sort((a, b) => {
      const ia = rarityOrder.indexOf(a.rarity);
      const ib = rarityOrder.indexOf(b.rarity);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return result;
  }

  async function enhanceUnknownStock(items) {
    const unknownItems = items.filter((it) => it.stockStatus === "在庫確認不可" && it.url);
    for (const item of unknownItems.slice(0, 6)) {
      try {
        const html = await fetchHtml(item.url);
        const stock = detectStockFromDetailHtml(html);
        item.inStock = stock.inStock;
        item.stockStatus = stock.stockStatus;
      } catch (_) {
        // 保留原有状态
      }
    }
    return items;
  }

  async function fetchCardPrices(cardName) {
    const name = normalizeText(cardName);
    if (!name) throw new Error("card_name_empty");

    const cached = await window.CardRushCache.get(name);
    if (cached) {
      if (cached.__error) throw new Error(cached.__error);
      return cached;
    }

    if (inflightMap.has(name)) return inflightMap.get(name);

    const p = debouncePromise(async () => {
      try {
        await sleep(50); // gentle rate limit
        const url = makeSearchUrl(name);
        const html = await fetchHtml(url);
        const items = parseListPage(html, name);

        const finalItems = await enhanceUnknownStock(items);
        const data = {
          cardName: name,
          source: "cardrush",
          fetchedAt: Date.now(),
          items: finalItems
        };

        await window.CardRushCache.set(name, data);
        return data;
      } catch (err) {
        await window.CardRushCache.setFailure(name, err?.message || "fetch_failed");
        throw err;
      } finally {
        inflightMap.delete(name);
      }
    }, 180);

    inflightMap.set(name, p);
    return p;
  }

  window.CardRushAPI = {
    fetchCardPrices,
    normalizeText
  };
})();
