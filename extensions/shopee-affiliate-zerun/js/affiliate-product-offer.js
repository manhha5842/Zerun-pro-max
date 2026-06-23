(() => {
  if (window.__zerunAffiliateProductOfferBridge) return;
  window.__zerunAffiliateProductOfferBridge = true;

  async function checkLoginStatus() {
    try {
      const response = await fetch("https://affiliate.shopee.vn/api/v3/report/list?page_size=1&page_num=1&version=1", {
        method: "GET",
        credentials: "include"
      });
      return response.status !== 401;
    } catch (error) {
      console.error("checkLoginStatus error:", error);
      return false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "BATCH_CUSTOM_LINK_RESPONSE") return;

    const { requestId, result, error, payload, status, pageMeta } = event.data;
    chrome.runtime.sendMessage({
      type: "BATCH_CUSTOM_LINK_RESULT",
      requestId,
      success: !error,
      data: result,
      payload: payload || null,
      httpStatus: status || null,
      pageMeta: pageMeta || null,
      error: error || null
    }).catch((sendError) => {
      console.error("Failed to forward result to background:", sendError);
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "PING") {
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "CHECK_LOGIN") {
      (async () => {
        try {
          const isLoggedIn = await checkLoginStatus();
          sendResponse({
            isLoggedIn,
            href: window.location.href,
            title: document.title
          });
        } catch (error) {
          sendResponse({
            isLoggedIn: false,
            error: error instanceof Error ? error.message : String(error),
            href: window.location.href,
            title: document.title
          });
        }
      })();
      return true;
    }

    return false;
  });
})();
