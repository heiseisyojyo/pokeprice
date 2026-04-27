chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "CARDRUSH_FETCH") return;

  const { url } = message;
  if (!url || !url.startsWith("https://www.cardrush-pokemon.jp/")) {
    sendResponse({ ok: false, error: "Invalid URL" });
    return false;
  }

  (async () => {
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "omit"
      });
      const text = await res.text();
      sendResponse({
        ok: res.ok,
        status: res.status,
        text
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err?.message || String(err)
      });
    }
  })();

  return true;
});
