importScripts("affiliate-api.js", "zerun-ws-client.js");

const ZERUN_KEEP_ALIVE_ALARM = "zerun-extension-keep-alive";

function ensureKeepAliveAlarm() {
  chrome.alarms.create(ZERUN_KEEP_ALIVE_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("zerunConfig");
  if (!stored.zerunConfig) {
    await saveZerunConfig(DEFAULT_ZERUN_CONFIG);
  }
  ensureKeepAliveAlarm();
  ZerunWS.start().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  ensureKeepAliveAlarm();
  ZerunWS.start().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ZERUN_KEEP_ALIVE_ALARM) return;
  ZerunWS.start().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  return true;
});

async function handleRuntimeMessage(message) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, message: "Message không hợp lệ." };
  }

  if (message.type === "GET_STATUS") {
    return { ok: true, status: ZerunWS.getStatus(), config: await loadZerunConfig() };
  }

  if (message.type === "CONNECT") {
    return { ok: true, status: await ZerunWS.connect() };
  }

  if (message.type === "DISCONNECT") {
    return { ok: true, status: ZerunWS.disconnect() };
  }

  if (message.type === "SAVE_CONFIG") {
    return { ok: true, config: await ZerunWS.updateConfig(message.config || {}) };
  }

  if (message.type === "CREATE_AFFILIATE_LINK") {
    const config = await loadZerunConfig();
    return createAffiliateLink({
      url: message.url,
      subIds: message.subIds,
      outputType: message.outputType || "shortlink"
    }, config);
  }

  return { ok: false, message: "Message type không được hỗ trợ." };
}

ZerunWS.start().catch(() => undefined);
