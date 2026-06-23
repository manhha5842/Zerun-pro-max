const els = {
  statusBadge: document.querySelector("#statusBadge"),
  wsUrl: document.querySelector("#wsUrl"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  message: document.querySelector("#message")
};

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setMessage(text, tone = "") {
  els.message.textContent = text || "";
  els.message.dataset.tone = tone;
}

function render(state) {
  const status = state?.status || {};
  const config = state?.config || {};
  const connected = Boolean(status.connected);

  els.wsUrl.value = config.wsUrl || "ws://localhost:17385";
  els.statusBadge.textContent = connected ? status.busy ? "Đang convert" : "Đã kết nối" : "Chưa kết nối";
  els.statusBadge.dataset.tone = connected ? status.busy ? "warn" : "good" : "danger";
  els.connectButton.hidden = connected;
  els.disconnectButton.hidden = !connected;

  if (connected) {
    setMessage("WebSocket đã kết nối với Zerun. Convert link chạy trong trang Zerun Admin.", "good");
    return;
  }

  if (status.lastError) {
    setMessage(`Kết nối thất bại: ${status.lastError}`, "danger");
  } else {
    setMessage("Extension chưa kết nối với Zerun.", "");
  }
}

async function refresh() {
  const state = await send("GET_STATUS");
  render(state);
  return state;
}

els.connectButton.addEventListener("click", async () => {
  const wsUrl = els.wsUrl.value.trim();
  els.connectButton.disabled = true;
  setMessage("Đang kiểm tra kết nối Zerun...", "");
  try {
    await send("SAVE_CONFIG", { config: { wsUrl } });
    const response = await send("CONNECT");
    const state = await refresh();
    if (response?.ok && response.status?.connected) {
      setMessage("Kết nối thành công.", "good");
    } else if (state?.status?.connected) {
      setMessage("Kết nối thành công.", "good");
    } else {
      setMessage(`Kết nối thất bại: ${response?.message || state?.status?.lastError || "Không mở được WebSocket."}`, "danger");
    }
  } catch (error) {
    const state = await refresh().catch(() => null);
    if (state?.status?.connected) {
      setMessage("Kết nối thành công.", "good");
    } else {
      setMessage(`Kết nối thất bại: ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  } finally {
    els.connectButton.disabled = false;
  }
});

els.disconnectButton.addEventListener("click", async () => {
  await send("DISCONNECT");
  await refresh();
  setMessage("Đã ngắt kết nối Zerun.", "good");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ZERUN_STATUS") refresh().catch(() => undefined);
});

refresh().catch((error) => setMessage(error.message, "danger"));
