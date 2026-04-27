(() => {
  const CACHE_PREFIX = "cardrush_cache_v1:";
  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const FAIL_TTL_MS = 5 * 60 * 1000; // 5min

  const memCache = new Map();

  function makeKey(cardName) {
    return `${CACHE_PREFIX}${(cardName || "").trim()}`;
  }

  async function getFromStorage(key) {
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  }

  async function setToStorage(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  function isExpired(entry) {
    if (!entry || typeof entry.expireAt !== "number") return true;
    return Date.now() > entry.expireAt;
  }

  async function get(cardName) {
    const key = makeKey(cardName);
    const m = memCache.get(key);
    if (m && !isExpired(m)) return m.value;

    const s = await getFromStorage(key);
    if (s && !isExpired(s)) {
      memCache.set(key, s);
      return s.value;
    }
    return null;
  }

  async function set(cardName, value, ttl = DEFAULT_TTL_MS) {
    const key = makeKey(cardName);
    const entry = {
      value,
      expireAt: Date.now() + ttl
    };
    memCache.set(key, entry);
    await setToStorage(key, entry);
  }

  async function setFailure(cardName, errorMessage = "fetch_failed") {
    await set(cardName, { __error: errorMessage }, FAIL_TTL_MS);
  }

  window.CardRushCache = {
    get,
    set,
    setFailure,
    DEFAULT_TTL_MS,
    FAIL_TTL_MS
  };
})();
