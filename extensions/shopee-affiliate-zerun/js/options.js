const fields = {
  wsUrl: document.querySelector("#wsUrl"),
  requestTimeoutMs: document.querySelector("#requestTimeoutMs"),
  reconnectDelayMs: document.querySelector("#reconnectDelayMs"),
  maxRetry: document.querySelector("#maxRetry"),
  autoConnect: document.querySelector("#autoConnect"),
  saveButton: document.querySelector("#saveButton"),
  message: document.querySelector("#message")
};

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setMessage(text, tone = "") {
  fields.message.textContent = text || "";
  fields.message.dataset.tone = tone;
}

function render(config) {
  fields.wsUrl.value = config.wsUrl || "ws://localhost:17385";
  fields.requestTimeoutMs.value = String(config.requestTimeoutMs || 15000);
  fields.reconnectDelayMs.value = String(config.reconnectDelayMs || 3000);
  fields.maxRetry.value = String(config.maxRetry ?? 1);
  fields.autoConnect.checked = Boolean(config.autoConnect);
}

async function load() {
  const response = await send("GET_STATUS");
  render(response.config || {});
}

fields.saveButton.addEventListener("click", async () => {
  const config = {
    wsUrl: fields.wsUrl.value.trim() || "ws://localhost:17385",
    requestTimeoutMs: Number(fields.requestTimeoutMs.value || 15000),
    reconnectDelayMs: Number(fields.reconnectDelayMs.value || 3000),
    maxRetry: Number(fields.maxRetry.value || 0),
    autoConnect: fields.autoConnect.checked,
    autoOpenLoginTab: true,
    focusAffiliateTabOnLoginRequired: false,
    keepAffiliateTabInBackground: true
  };
  await send("SAVE_CONFIG", { config });
  setMessage("Đã lưu cấu hình.", "good");
});

load().catch((error) => setMessage(error.message, "danger"));
