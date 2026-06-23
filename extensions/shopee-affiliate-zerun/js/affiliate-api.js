const DEFAULT_ZERUN_CONFIG = {
  wsUrl: "ws://localhost:17385",
  autoConnect: true,
  reconnectDelayMs: 3000,
  heartbeatIntervalMs: 15000,
  requestTimeoutMs: 15000,
  maxRetry: 1,
  affiliateTabUrl: "https://affiliate.shopee.vn/dashboard",
  apiMode: "background_first",
  keepAffiliateTabInBackground: true,
  autoOpenLoginTab: true,
  focusAffiliateTabOnLoginRequired: false
};

const BATCH_CUSTOM_LINK_ENDPOINT = "https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink";
const BATCH_CUSTOM_LINK_QUERY = `
query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) {
  batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) {
    shortLink
    longLink
    failCode
  }
}`;

const pendingCustomLinkRequests = new Map();

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "BATCH_CUSTOM_LINK_RESULT") return false;
  const pending = pendingCustomLinkRequests.get(message.requestId);
  if (!pending) return false;
  pendingCustomLinkRequests.delete(message.requestId);
  pending.resolve(message);
  return false;
});

function mergeConfig(config) {
  return { ...DEFAULT_ZERUN_CONFIG, ...(config || {}) };
}

async function loadZerunConfig() {
  const stored = await chrome.storage.local.get("zerunConfig");
  return mergeConfig(stored.zerunConfig);
}

async function saveZerunConfig(nextConfig) {
  const config = mergeConfig(nextConfig);
  await chrome.storage.local.set({ zerunConfig: config });
  return config;
}

function normalizeSubIds(subIds) {
  const record = Array.isArray(subIds)
    ? {
      subId1: subIds[0],
      subId2: subIds[1],
      subId3: subIds[2],
      subId4: subIds[3],
      subId5: subIds[4]
    }
    : (subIds || {});

  return {
    subId1: String(record.subId1 || record.sub_id1 || ""),
    subId2: String(record.subId2 || record.sub_id2 || ""),
    subId3: String(record.subId3 || record.sub_id3 || ""),
    subId4: String(record.subId4 || record.sub_id4 || ""),
    subId5: String(record.subId5 || record.sub_id5 || "")
  };
}

function buildBatchCustomLinkPayload(originalLink, subIds) {
  return {
    operationName: "batchGetCustomLink",
    query: BATCH_CUSTOM_LINK_QUERY,
    variables: {
      linkParams: [
        {
          originalLink,
          advancedLinkParams: normalizeSubIds(subIds)
        }
      ],
      sourceCaller: "CUSTOM_LINK_CALLER"
    }
  };
}

function isLoginRequiredPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (extractBatchCustomLinks(payload).length > 0) return false;

  const candidates = [];
  if (typeof payload.error === "string") candidates.push(payload.error);
  if (typeof payload.message === "string") candidates.push(payload.message);
  if (typeof payload.msg === "string") candidates.push(payload.msg);
  if (typeof payload.code === "string" || typeof payload.code === "number") candidates.push(String(payload.code));
  if (typeof payload.raw === "string") candidates.push(payload.raw.slice(0, 500));

  if (Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      if (!error || typeof error !== "object") continue;
      if (typeof error.message === "string") candidates.push(error.message);
      if (typeof error.code === "string" || typeof error.code === "number") candidates.push(String(error.code));
      if (typeof error.extensions?.code === "string" || typeof error.extensions?.code === "number") {
        candidates.push(String(error.extensions.code));
      }
    }
  }

  const text = candidates.join(" ").toLowerCase();
  return text.includes("not authenticated")
    || text.includes("unauthorized")
    || text.includes("unauthenticated")
    || text.includes("need login")
    || text.includes("need_login")
    || text.includes("login required")
    || text.includes("permission denied")
    || text === "401"
    || text === "403";
}

function loginRequiredResult(sourceUrl, via, message, meta = {}) {
  return {
    ok: false,
    errorCode: "LOGIN_REQUIRED",
    status: "NEED_LOGIN",
    sourceUrl,
    via,
    meta,
    message: message || "Shopee Affiliate chưa sẵn sàng. Extension đã mở tab affiliate, hãy kiểm tra đăng nhập rồi bấm convert lại."
  };
}

function getPayloadError(payload) {
  if (payload?.error) return String(payload.error);
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const first = payload.errors[0] || {};
    return String(first.message || first.extensions?.code || first.code || "Shopee Affiliate API trả lỗi.");
  }
  return "";
}

function extractBatchCustomLinks(payload) {
  const data = payload?.data?.batchCustomLink;
  if (Array.isArray(data)) return data;
  if (data?.customLinks && Array.isArray(data.customLinks)) return data.customLinks;
  if (data?.links && Array.isArray(data.links)) return data.links;
  if (data && typeof data === "object") return [data];
  return [];
}

async function parseBatchCustomLinkResponse(payload, originalLink, subIds, via, meta = {}) {
  if (isLoginRequiredPayload(payload)) {
    return loginRequiredResult(originalLink, via, "Shopee Affiliate trả về trạng thái cần đăng nhập. Hãy kiểm tra tab affiliate rồi bấm convert lại.");
  }

  const apiError = getPayloadError(payload);
  if (apiError) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: originalLink,
      via,
      meta,
      errorCode: "SHOPEE_API_ERROR",
      message: apiError
    };
  }

  const links = extractBatchCustomLinks(payload);
  const firstLink = links[0];
  if (!firstLink || typeof firstLink !== "object") {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: originalLink,
      via,
      meta,
      errorCode: "EMPTY_RESPONSE",
      message: "Shopee Affiliate không trả link kết quả."
    };
  }

  const failCode = firstLink.failCode || firstLink.errorCode || firstLink.error_code || "";
  if (failCode) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: originalLink,
      via,
      meta,
      failCode: String(failCode),
      errorCode: String(failCode),
      message: firstLink.message || `Shopee Affiliate từ chối convert link này: ${failCode}`
    };
  }

  const shortLink = firstLink.shortLink || firstLink.short_link || "";
  const rawLongLink = firstLink.longLink || firstLink.long_link || firstLink.rawLongLink || firstLink.raw_long_link || "";
  const longLink = await convertUniversalLinkToAnRedir(rawLongLink, originalLink, subIds);
  const convertedUrl = shortLink || longLink;
  if (!convertedUrl) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: originalLink,
      via,
      meta,
      errorCode: "NO_CONVERTED_LINK",
      message: "Shopee Affiliate trả kết quả nhưng không có link affiliate."
    };
  }

  return {
    ok: true,
    status: "DONE",
    sourceUrl: originalLink,
    shortLink,
    longLink,
    rawLongLink,
    convertedUrl,
    via,
    meta
  };
}

async function readResponseJson(response) {
  const text = await response.text();
  try {
    return { text, json: text ? JSON.parse(text) : {} };
  } catch {
    return { text, json: { raw: text } };
  }
}

async function createAffiliateLinkViaBackgroundFetch(task) {
  const response = await fetch(BATCH_CUSTOM_LINK_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "accept": "application/json"
    },
    body: JSON.stringify(buildBatchCustomLinkPayload(task.url, task.subIds))
  });
  const { text, json } = await readResponseJson(response);
  const meta = { httpStatus: response.status };

  if (response.status === 401 || response.status === 403 || isLoginRequiredPayload(json)) {
    return loginRequiredResult(task.url, "background_fetch", undefined, meta);
  }

  if (!response.ok) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: task.url,
      via: "background_fetch",
      meta,
      errorCode: `HTTP_${response.status}`,
      message: text || `Shopee Affiliate API lỗi HTTP ${response.status}.`
    };
  }

  return parseBatchCustomLinkResponse(json, task.url, task.subIds, "background_fetch", meta);
}

async function createAffiliateLinkViaAffiliateTab(task) {
  const tabResult = await findAffiliateTabForConvert(task.url);
  if (!tabResult.ok) {
    return tabResult.result;
  }

  const tabId = tabResult.tabId;
  await waitForTabComplete(tabId, 15000);

  try {
    await ensureAffiliateProductOfferBridge(tabId);
  } catch (error) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: task.url,
      via: "affiliate_tab",
      errorCode: "CONTENT_SCRIPT_INJECT_FAILED",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const loginState = await chrome.tabs.sendMessage(tabId, { type: "CHECK_LOGIN" }).catch((error) => ({
    isLoggedIn: false,
    error: error instanceof Error ? error.message : String(error)
  }));

  if (!loginState?.isLoggedIn) {
    return loginRequiredResult(
      task.url,
      "affiliate_tab",
      "Tab affiliate đang mở nhưng Shopee API vẫn trả trạng thái chưa đăng nhập.",
      { page: loginState || null }
    );
  }

  const requestId = `link_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const resultPromise = waitForCustomLinkResult(requestId, 12000);

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (endpoint, payload, currentRequestId) => {
      const pageMeta = {
        href: location.href,
        title: document.title
      };
      fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json; charset=UTF-8",
          "accept": "application/json"
        },
        body: JSON.stringify(payload)
      }).then((response) => response.text().then((text) => {
        let json = null;
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = { raw: text.slice(0, 500) };
        }
        const firstError = Array.isArray(json?.errors) ? json.errors[0] : null;
        window.postMessage({
          type: "BATCH_CUSTOM_LINK_RESPONSE",
          requestId: currentRequestId,
          status: response.status,
          pageMeta,
          payload: json,
          result: json?.data ? json.data.batchCustomLink : null,
          error: json?.error
            ? `Error ${json.error}${json.tracking_id ? ` (tracking_id: ${json.tracking_id})` : ""}`
            : firstError?.message || null
        }, "*");
      })).catch((error) => {
        window.postMessage({
          type: "BATCH_CUSTOM_LINK_RESPONSE",
          requestId: currentRequestId,
          pageMeta,
          error: error?.message || "Unknown error"
        }, "*");
      });
    },
    args: [
      BATCH_CUSTOM_LINK_ENDPOINT,
      buildBatchCustomLinkPayload(task.url, task.subIds),
      requestId
    ]
  });

  const bridgeResult = await resultPromise;
  const payload = bridgeResult.payload || (bridgeResult.error ? { error: bridgeResult.error } : { data: { batchCustomLink: bridgeResult.data } });
  const meta = { httpStatus: bridgeResult.httpStatus, page: bridgeResult.pageMeta || loginState };

  if (bridgeResult.httpStatus === 401 || bridgeResult.httpStatus === 403 || isLoginRequiredPayload(payload)) {
    return loginRequiredResult(task.url, "affiliate_tab", "Tab affiliate vẫn báo cần đăng nhập. Hãy kiểm tra đúng tài khoản Shopee Affiliate rồi bấm convert lại.", meta);
  }

  return parseBatchCustomLinkResponse(payload, task.url, task.subIds, "affiliate_tab", meta);
}

async function expandAndCleanLink(url) {
  let resolvedUrl = url;
  
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const isShort = host === "s.shopee.vn" || host === "s.lazada.vn" || host.endsWith(".s.shopee.vn") || host.endsWith(".s.lazada.vn") || host === "shp.ee" || host === "shopee.ee";
    if (isShort) {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      const response = await fetch(url, { 
        method: 'GET', 
        redirect: 'manual', 
        headers 
      });

      if (response.status === 301 || response.status === 302) {
        const location = response.headers.get('location');
        if (location) resolvedUrl = location;
      } else {
        const html = await response.text();
        const metaMatch = html.match(/url=([^"]+)/i);
        if (metaMatch && metaMatch[1]) {
          resolvedUrl = decodeURIComponent(metaMatch[1]);
        } else {
          const hrefMatch = html.match(/href="([^"]+)"/i);
          if (hrefMatch && hrefMatch[1]) {
            resolvedUrl = decodeURIComponent(hrefMatch[1]);
          }
        }
      }
    }
  } catch (e) {
    console.error("Lỗi expand link:", e);
  }

  try {
    const parsed = new URL(resolvedUrl);
    const paramsToDelete = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gads_t_sig", "gclid", "fbclid", "twclid", "msclkid",
      "affiliate_id", "sub_id", "subid", "subId", "sub_id1", "sub_id2", "sub_id3", "sub_id4", "sub_id5", "sub_id6",
      "exlaz", "dsource", "laz_share_info", "laz_token", "c", "t"
    ];
    paramsToDelete.forEach(key => parsed.searchParams.delete(key));
    resolvedUrl = parsed.toString();
  } catch (e) {
    // Keep resolvedUrl.
  }
  
  return resolvedUrl;
}

async function createLazadaAffiliateLink(cleanedUrl, subIds, config, lazadaSubIdSet = null) {
  const tabResult = await findLazadaAffiliateTab(cleanedUrl);
  if (!tabResult.ok) {
    return tabResult.result;
  }

  const tabId = tabResult.tabId;
  await waitForTabComplete(tabId, 15000);

  try {
    await ensureAffiliateProductOfferBridge(tabId);
  } catch (error) {
    return {
      ok: false,
      status: "FAILED",
      sourceUrl: cleanedUrl,
      via: "lazada_tab",
      errorCode: "CONTENT_SCRIPT_INJECT_FAILED",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const requestId = `laz_link_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const resultPromise = waitForCustomLinkResult(requestId, 20000);

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (urlToConvert, currentRequestId, subIdSetInput) => {
      const pageMeta = {
        href: location.href,
        title: document.title
      };

      async function convert() {
        try {
          const subIdSet = subIdSetInput || {};
          let subIdKey = subIdSet.subIdKey || "";

          const subId1 = (subIdSet.subId1 || "").trim();

          if (!subId1) {
            // Nếu không cấu hình subId1, bỏ qua việc lấy list/tạo template, dùng "" convert luôn
            subIdKey = "";
          } else if (!subIdKey) {
            const listRes = await fetch("https://adsense.lazada.vn/subId-templates/list.json", {
              method: "GET",
              headers: {
                "accept": "application/json, text/plain, */*",
                "lang": "en_US"
              }
            });
            
            if (listRes.status === 401 || listRes.status === 403) {
              throw new Error("LOGIN_REQUIRED");
            }
            
            const listData = await listRes.json();
            if (!listData.success) {
              throw new Error(listData.message || "Không lấy được danh sách subId từ Lazada Adsense.");
            }
            
            const subIdList = listData.data?.subIdList || [];
            const targetSubId = subIdList.find(item => {
              const ep = item.extraParam || {};
              return (ep.subId1 || "") === subId1 &&
                     (ep.subId2 || "") === (subIdSet.subId2 || "").trim() &&
                     (ep.subId3 || "") === (subIdSet.subId3 || "").trim() &&
                     (ep.subId4 || "") === (subIdSet.subId4 || "").trim() &&
                     (ep.subId5 || "") === (subIdSet.subId5 || "").trim() &&
                     (ep.subId6 || "") === (subIdSet.subId6 || "").trim();
            });

            if (targetSubId) {
              subIdKey = targetSubId.subIdKey;
            } else {
              const addRes = await fetch("https://adsense.lazada.vn/subId-templates/add.json", {
                method: "POST",
                headers: {
                  "accept": "application/json, text/plain, */*",
                  "content-type": "application/json"
                },
                body: JSON.stringify({
                  extraParam: {
                    linkFormat: "1",
                    subAffId: "",
                    subId1: subId1,
                    subId2: (subIdSet.subId2 || "").trim(),
                    subId3: (subIdSet.subId3 || "").trim(),
                    subId4: (subIdSet.subId4 || "").trim(),
                    subId5: (subIdSet.subId5 || "").trim(),
                    subId6: (subIdSet.subId6 || "").trim()
                  }
                })
              });
              const addData = await addRes.json();
              if (addData.success && addData.data?.subIdKey) {
                subIdKey = addData.data.subIdKey;
              } else {
                throw new Error(addData.message || "Không thể tạo template subId mới trên Lazada Adsense.");
              }
            }
          }
          
          const convertRes = await fetch("https://adsense.lazada.vn/newOffer/link-convert-v2.json", {
            method: "POST",
            headers: {
              "accept": "application/json, text/plain, */*",
              "content-type": "application/json"
            },
            body: JSON.stringify({
              jumpUrl: urlToConvert,
              subIdTemplateKey: subIdKey
            })
          });
          
          if (convertRes.status === 401 || convertRes.status === 403) {
            throw new Error("LOGIN_REQUIRED");
          }
          
          const convertData = await convertRes.json();
          if (!convertData.success) {
            throw new Error(convertData.message || "Lazada API trả về thất bại.");
          }
          
          window.postMessage({
            type: "BATCH_CUSTOM_LINK_RESPONSE",
            requestId: currentRequestId,
            status: 200,
            pageMeta,
            payload: convertData,
            result: {
              ...convertData.data,
              subIdKey: subIdKey
            },
            error: null
          }, "*");
        } catch (error) {
          window.postMessage({
            type: "BATCH_CUSTOM_LINK_RESPONSE",
            requestId: currentRequestId,
            pageMeta,
            error: error?.message || "Lỗi không xác định khi convert Lazada link"
          }, "*");
        }
      }
      
      convert();
    },
    args: [cleanedUrl, requestId, lazadaSubIdSet]
  });

  try {
    const bridgeResult = await resultPromise;
    if (bridgeResult.error) {
      if (bridgeResult.error === "LOGIN_REQUIRED") {
        return {
          ok: false,
          errorCode: "LOGIN_REQUIRED",
          status: "NEED_LOGIN",
          sourceUrl: cleanedUrl,
          via: "lazada_tab",
          message: "Lazada Adsense yêu cầu đăng nhập. Vui lòng đăng nhập trên tab Lazada Adsense rồi thử lại."
        };
      }
      return {
        ok: false,
        errorCode: "LAZADA_API_ERROR",
        status: "FAILED",
        sourceUrl: cleanedUrl,
        via: "lazada_tab",
        message: bridgeResult.error
      };
    }

    const data = bridgeResult.payload?.data;
    if (!data || !data.shortLink) {
      return {
        ok: false,
        errorCode: "NO_CONVERTED_LINK",
        status: "FAILED",
        sourceUrl: cleanedUrl,
        via: "lazada_tab",
        message: "Lazada API không trả về shortLink."
      };
    }

    return {
      ok: true,
      status: "DONE",
      sourceUrl: cleanedUrl,
      shortLink: data.shortLink,
      longLink: data.deepLink || data.shortLink,
      rawLongLink: data.deepLink || data.shortLink,
      convertedUrl: data.shortLink,
      via: "lazada_tab",
      meta: { page: bridgeResult.pageMeta, subIdKey: bridgeResult.result?.subIdKey }
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "LAZADA_CONVERT_TIMEOUT",
      status: "FAILED",
      sourceUrl: cleanedUrl,
      via: "lazada_tab",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function syncLazadaSubId(action, template) {
  const tabResult = await findLazadaAffiliateTab("https://adsense.lazada.vn/");
  if (!tabResult.ok) {
    return { success: false, error: tabResult.result?.message || "Không thể mở tab Lazada Adsense." };
  }

  const tabId = tabResult.tabId;
  await waitForTabComplete(tabId, 15000);

  try {
    await ensureAffiliateProductOfferBridge(tabId);
  } catch (error) {
    return { success: false, error: `Content script inject failed: ${error.message}` };
  }

  const requestId = `laz_sync_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const resultPromise = waitForCustomLinkResult(requestId, 20000);

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (act, temp, currentRequestId) => {
      async function runSync() {
        try {
          let url = "";
          let body = null;

          if (act === "add") {
            url = "https://adsense.lazada.vn/subId-templates/add.json";
            body = JSON.stringify({
              extraParam: {
                linkFormat: "1",
                subAffId: "",
                subId1: (temp.subId1 || "").trim(),
                subId2: (temp.subId2 || "").trim(),
                subId3: (temp.subId3 || "").trim(),
                subId4: (temp.subId4 || "").trim(),
                subId5: (temp.subId5 || "").trim(),
                subId6: (temp.subId6 || "").trim()
              }
            });
          } else if (act === "edit") {
            url = "https://adsense.lazada.vn/subId-templates/edit.json";
            body = JSON.stringify({
              subIdTemplateKey: temp.subIdKey || temp.subIdTemplateKey,
              extraParam: {
                linkFormat: "1",
                subAffId: "",
                subId1: (temp.subId1 || "").trim(),
                subId2: (temp.subId2 || "").trim(),
                subId3: (temp.subId3 || "").trim(),
                subId4: (temp.subId4 || "").trim(),
                subId5: (temp.subId5 || "").trim(),
                subId6: (temp.subId6 || "").trim()
              }
            });
          } else if (act === "delete") {
            const key = temp.subIdKey || temp.subIdTemplateKey;
            url = `https://adsense.lazada.vn/subId-templates/${key}/delete.json`;
            body = JSON.stringify({});
          }

          const res = await fetch(url, {
            method: "POST",
            headers: {
              "accept": "application/json, text/plain, */*",
              "content-type": "application/json"
            },
            body
          });

          if (res.status === 401 || res.status === 403) {
            throw new Error("LOGIN_REQUIRED");
          }

          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || `Lazada API trả lỗi khi ${act} template.`);
          }

          window.postMessage({
            type: "BATCH_CUSTOM_LINK_RESPONSE",
            requestId: currentRequestId,
            status: 200,
            payload: data,
            result: {
              success: true,
              subIdKey: data.data?.subIdKey || temp.subIdKey || ""
            },
            error: null
          }, "*");
        } catch (error) {
          window.postMessage({
            type: "BATCH_CUSTOM_LINK_RESPONSE",
            requestId: currentRequestId,
            error: error?.message || "Lỗi không xác định khi gọi Lazada Adsense API"
          }, "*");
        }
      }

      runSync();
    },
    args: [action, template, requestId]
  });

  try {
    const bridgeResult = await resultPromise;
    if (bridgeResult.error) {
      if (bridgeResult.error === "LOGIN_REQUIRED") {
        return { success: false, error: "LOGIN_REQUIRED", message: "Lazada Adsense yêu cầu đăng nhập." };
      }
      return { success: false, error: bridgeResult.error };
    }
    return {
      success: true,
      subIdKey: bridgeResult.result?.subIdKey || ""
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function findLazadaAffiliateTab(sourceUrl) {
  const tabs = await chrome.tabs.query({
    url: "https://adsense.lazada.vn/*"
  });

  if (tabs.length > 0 && tabs[0].id) {
    return { ok: true, tabId: tabs[0].id };
  }

  await chrome.tabs.create({
    url: "https://adsense.lazada.vn/index.htm#!/",
    active: true
  });

  return {
    ok: false,
    result: {
      ok: false,
      errorCode: "LOGIN_REQUIRED",
      status: "NEED_LOGIN",
      sourceUrl,
      via: "lazada_tab_missing",
      message: "Chưa có tab Lazada Adsense. Extension đã tự mở tab Adsense, hãy đăng nhập rồi bấm convert lại."
    }
  };
}

async function createAffiliateLink(task, configInput) {
  const config = mergeConfig(configInput || await loadZerunConfig());
  const cleanedUrl = await expandAndCleanLink(task.url);
  const isLazada = cleanedUrl.includes("lazada.vn") || cleanedUrl.includes("lazada.com");

  if (isLazada) {
    return createLazadaAffiliateLink(cleanedUrl, task.subIds, config);
  }

  const shopeeTask = { ...task, url: cleanedUrl };
  let lastResult = null;

  if (config.apiMode !== "affiliate_tab_only") {
    lastResult = await createAffiliateLinkViaBackgroundFetch(shopeeTask);
    if (lastResult.ok) return lastResult;
    if (config.apiMode === "background_only") return lastResult;
  }

  if (config.apiMode !== "background_only") {
    lastResult = await createAffiliateLinkViaAffiliateTab(shopeeTask);
    if (lastResult.ok || lastResult.status === "NEED_LOGIN") return lastResult;
  }

  return lastResult || {
    ok: false,
    status: "FAILED",
    sourceUrl: task.url,
    via: "unknown",
    errorCode: "CONVERT_FAILED",
    message: "Không convert được link Shopee."
  };
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function ensureAffiliateProductOfferBridge(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["js/affiliate-product-offer.js"]
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  }
}

function waitForCustomLinkResult(requestId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCustomLinkRequests.delete(requestId);
      reject(new Error("Request timeout. Vui lòng thử lại."));
    }, timeoutMs);

    pendingCustomLinkRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

async function findAffiliateTabForConvert(sourceUrl) {
  const tabs = await chrome.tabs.query({
    url: "https://affiliate.shopee.vn/*"
  });

  if (tabs.length > 0 && tabs[0].id) {
    return { ok: true, tabId: tabs[0].id };
  }

  await chrome.tabs.create({
    url: "https://affiliate.shopee.vn/dashboard",
    active: true
  });

  return {
    ok: false,
    result: loginRequiredResult(
      sourceUrl,
      "affiliate_tab_missing",
      "Chưa có tab Shopee Affiliate. Extension đã tự mở tab affiliate, hãy đăng nhập hoặc chờ trang tải xong rồi bấm convert lại."
    )
  };
}

async function convertUniversalLinkToAnRedir(longLink, originalLink, subIds = {}) {
  if (!longLink || typeof longLink !== "string") return longLink || "";
  if (!longLink.includes("/universal-link")) return longLink;

  try {
    const universalUrl = new URL(longLink);
    const landingUrl = extractLandingUrl(universalUrl, originalLink);
    const cleanLandingUrl = removeTrackingParams(landingUrl);
    const affiliateId = universalUrl.searchParams.get("affiliate_id") || universalUrl.searchParams.get("affiliateId");
    if (!affiliateId) return longLink;

    const normalizedSubIds = normalizeSubIds(subIds);
    const subId = [
      normalizedSubIds.subId1,
      normalizedSubIds.subId2,
      normalizedSubIds.subId3,
      normalizedSubIds.subId4,
      normalizedSubIds.subId5
    ].map((value) => value.trim()).filter((value) => value && !value.includes("-")).join("-");

    return `https://s.shopee.vn/an_redir?origin_link=${encodeURIComponent(cleanLandingUrl)}&affiliate_id=${affiliateId}${subId ? `&sub_id=${encodeURIComponent(subId)}` : ""}`;
  } catch {
    return longLink;
  }
}

function extractLandingUrl(universalUrl, fallbackUrl) {
  const keys = ["url", "target", "destination", "link", "redirect", "to"];
  for (const key of keys) {
    const value = universalUrl.searchParams.get(key);
    if (value) {
      try {
        return normalizeShopeeUrl(decodeURIComponent(value), fallbackUrl);
      } catch {
        return normalizeShopeeUrl(value, fallbackUrl);
      }
    }
  }

  const lastPathPart = universalUrl.pathname.split("/").filter(Boolean).at(-1);
  if (lastPathPart) {
    try {
      const decoded = decodeURIComponent(lastPathPart);
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return decoded;
      }
    } catch {
      // Keep fallback.
    }
  }

  return fallbackUrl;
}

function normalizeShopeeUrl(value, fallbackUrl) {
  if (!value) return fallbackUrl;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `https://shopee.vn${value}`;
  if (!value.includes("://")) return `https://shopee.vn/${value}`;
  return fallbackUrl;
}

function removeTrackingParams(url) {
  try {
    const parsed = new URL(url);
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gads_t_sig",
      "gclid",
      "fbclid",
      "twclid",
      "msclkid",
      "affiliate_id",
      "sub_id",
      "subid",
      "subId"
    ].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url;
  }
}
