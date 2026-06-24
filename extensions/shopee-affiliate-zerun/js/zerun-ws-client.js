const ZerunWS = (() => {
  let socket = null;
  let config = { ...DEFAULT_ZERUN_CONFIG };
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let connectPromise = null;
  let currentTask = null;
  let lastPongAt = 0;
  let status = {
    connected: false,
    busy: false,
    currentTaskId: null,
    lastError: null,
    lastResult: null
  };

  function notifyStatus(extra = {}) {
    status = { ...status, ...extra };
    chrome.runtime.sendMessage({ type: "ZERUN_STATUS", status }).catch(() => undefined);
    send({
      type: "STATUS_UPDATE",
      status: status.connected ? "CONNECTED" : "DISCONNECTED",
      busy: status.busy,
      taskId: status.currentTaskId,
      lastError: status.lastError
    });
  }

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function clearTimers() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    reconnectTimer = null;
    heartbeatTimer = null;
  }

  function scheduleReconnect() {
    if (!config.autoConnect || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch((error) => notifyStatus({ lastError: error.message }));
    }, config.reconnectDelayMs);
  }

  async function connect() {
    config = await loadZerunConfig();
    if (socket && socket.readyState === WebSocket.OPEN) {
      notifyStatus({ connected: true, lastError: null });
      return getStatus();
    }

    if (socket && socket.readyState === WebSocket.CONNECTING && connectPromise) {
      return connectPromise;
    }

    if (socket) socket.close();

    connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(config.wsUrl);
      socket = ws;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connectPromise = null;
        callback(value);
      };

      const timer = setTimeout(() => {
        notifyStatus({ connected: false, lastError: "Kết nối Zerun quá thời gian chờ." });
        ws.close();
        finish(reject, new Error("Kết nối Zerun quá thời gian chờ."));
      }, Math.max(3000, Math.min(config.requestTimeoutMs, 10000)));

      ws.addEventListener("open", () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        lastPongAt = Date.now();
        heartbeatTimer = setInterval(() => {
          const now = Date.now();
          if (lastPongAt && now - lastPongAt > Math.max(config.heartbeatIntervalMs * 2, 30000)) {
            notifyStatus({ connected: false, lastError: "Zerun WebSocket không phản hồi heartbeat." });
            ws.close();
            return;
          }
          send({ type: "PING", requestId: `ping_${now}`, ts: now });
        }, config.heartbeatIntervalMs);
        notifyStatus({ connected: true, lastError: null });
        finish(resolve, getStatus());
      });

      ws.addEventListener("close", () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (socket === ws) socket = null;
        notifyStatus({ connected: false, busy: false, currentTaskId: null });
        if (!settled) {
          finish(reject, new Error("Không kết nối được Zerun WebSocket."));
        }
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        notifyStatus({ connected: false, lastError: "Không kết nối được Zerun WebSocket." });
      });

      ws.addEventListener("message", (event) => {
        handleMessage(event.data).catch((error) => {
          notifyStatus({ lastError: error.message, busy: false, currentTaskId: null });
        });
      });
    });

    return connectPromise;
  }

  function disconnect() {
    clearTimers();
    connectPromise = null;
    if (socket) socket.close();
    socket = null;
    notifyStatus({ connected: false, busy: false, currentTaskId: null });
    return getStatus();
  }

  async function handleMessage(raw) {
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "PONG") {
      lastPongAt = Date.now();
      return;
    }

    if (message.type === "GET_STATUS") {
      send({ type: "STATUS", requestId: message.requestId, ...status });
      return;
    }

    if (message.type === "LAZADA_SYNC_SUBID") {
      await handleLazadaSyncSubId(message);
      return;
    }

    if (message.type === "CONVERT_LINK") {
      await handleConvertLink(message);
      return;
    }
  }

  async function handleLazadaSyncSubId(message) {
    if (currentTask) {
      send({
        type: "LAZADA_SYNC_SUBID_RESULT",
        requestId: message.requestId,
        success: false,
        message: "Extension đang bận xử lý tác vụ khác."
      });
      return;
    }

    const task = {
      requestId: message.requestId,
      taskId: message.taskId,
      action: message.action,
      template: message.template
    };

    currentTask = task;
    notifyStatus({ busy: true, currentTaskId: task.taskId, lastError: null });

    try {
      const result = await syncLazadaSubId(task.action, task.template);
      send({
        type: "LAZADA_SYNC_SUBID_RESULT",
        requestId: task.requestId,
        ...result
      });
      notifyStatus({
        busy: false,
        currentTaskId: null,
        lastError: result.success ? null : (result.message || "Đồng bộ Lazada Sub ID thất bại.")
      });
    } catch (error) {
      send({
        type: "LAZADA_SYNC_SUBID_RESULT",
        requestId: task.requestId,
        success: false,
        message: error instanceof Error ? error.message : String(error)
      });
      notifyStatus({
        busy: false,
        currentTaskId: null,
        lastError: error instanceof Error ? error.message : String(error)
      });
    } finally {
      currentTask = null;
    }
  }

  async function handleConvertLink(message) {
    if (currentTask) {
      send({
        type: "BUSY",
        requestId: message.requestId,
        taskId: message.taskId,
        status: "BUSY",
        errorCode: "EXTENSION_NOT_READY",
        message: "Extension chưa sẵn sàng để nhận link mới. Hãy thử lại sau vài giây."
      });
      return;
    }

    const task = {
      requestId: message.requestId,
      taskId: message.taskId,
      url: message.url,
      subIds: message.subIds,
      lazadaSubIdSet: message.lazadaSubIdSet,
      shopeeAffiliateId: message.shopeeAffiliateId,
      outputType: message.outputType || "shortlink"
    };

    currentTask = task;
    notifyStatus({ busy: true, currentTaskId: task.taskId, lastError: null });

    try {
      const result = await withTimeout(
        retryConvert(task),
        config.requestTimeoutMs,
        () => ({
          ok: false,
          status: "TIMEOUT",
          sourceUrl: task.url,
          errorCode: "TIMEOUT",
          message: "Shopee Affiliate không trả kết quả trong thời gian chờ."
        })
      );

      const payload = {
        type: result.status === "NEED_LOGIN" ? "NEED_LOGIN" : result.status === "NEED_MANUAL_VERIFY" ? "NEED_MANUAL_VERIFY" : "CONVERT_RESULT",
        requestId: task.requestId,
        taskId: task.taskId,
        status: result.status,
        sourceUrl: result.sourceUrl || task.url,
        shortLink: result.shortLink || null,
        longLink: result.longLink || null,
        rawLongLink: result.rawLongLink || null,
        convertedUrl: result.convertedUrl || result.shortLink || result.longLink || null,
        failCode: result.failCode || null,
        errorCode: result.errorCode || null,
        message: result.message || null,
        via: result.via || null,
        meta: result.meta || null
      };
      send(payload);
      notifyStatus({
        busy: false,
        currentTaskId: null,
        lastError: result.ok ? null : (result.message || result.errorCode || "Convert thất bại."),
        lastResult: payload
      });
    } catch (error) {
      const payload = {
        type: "CONVERT_RESULT",
        requestId: task.requestId,
        taskId: task.taskId,
        status: "FAILED",
        sourceUrl: task.url,
        errorCode: "EXTENSION_ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
      send(payload);
      notifyStatus({ busy: false, currentTaskId: null, lastError: payload.message, lastResult: payload });
    } finally {
      currentTask = null;
    }
  }

  async function retryConvert(task) {
    let lastResult = null;
    const attempts = Math.max(1, Number(config.maxRetry || 0) + 1);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      lastResult = await createAffiliateLink(task, config);
      if (lastResult.ok || lastResult.status === "NEED_LOGIN") return lastResult;
    }
    return lastResult;
  }

  function withTimeout(promise, timeoutMs, onTimeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(onTimeout()), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function getStatus() {
    return { ...status, wsUrl: config.wsUrl };
  }

  async function updateConfig(nextConfig) {
    config = await saveZerunConfig({ ...config, ...nextConfig });
    return config;
  }

  async function start() {
    config = await loadZerunConfig();
    if (config.autoConnect) await connect().catch(() => getStatus());
    return getStatus();
  }

  return {
    start,
    connect,
    disconnect,
    getStatus,
    updateConfig
  };
})();
