importScripts("../shared/core.js", "transcription.js");

const core = globalThis.VoiceTranscriberCore;
const backgroundCore = globalThis.VoiceTranscriberBackgroundCore;
const captureSessions = new Map();
const activeTranscriptions = new Map();

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const session = captureSessions.get(details.tabId);
    if (!session || Date.now() > session.expiresAt) return;
    if (details.type !== "media" && !core.looksLikeMediaUrl(details.url) && !core.isMediaCdnUrl(details.url)) return;
    if (!session.urls.includes(details.url)) session.urls.push(details.url);
    if (session.urls.length > 12) session.urls.shift();
  },
  {
    urls: [
      "https://*.messenger.com/*",
      "https://*.facebook.com/*",
      "https://*.instagram.com/*",
      "https://*.fbsbx.com/*",
      "https://*.cdninstagram.com/*",
      "https://*.fbcdn.net/*"
    ]
  }
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (request.action === "BEGIN_AUDIO_CAPTURE") {
    if (!tabId || typeof request.requestId !== "string") {
      sendResponse({ success: false, error: "Invalid capture request." });
      return false;
    }
    captureSessions.set(tabId, {
      requestId: request.requestId,
      expiresAt: Date.now() + 4000,
      urls: []
    });
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "GET_AUDIO_CAPTURE") {
    const session = tabId ? captureSessions.get(tabId) : null;
    const urls = backgroundCore.getCaptureResults(session, request.requestId);
    if (session?.requestId === request.requestId) captureSessions.delete(tabId);
    sendResponse({ success: urls.length > 0, urls });
    return false;
  }

  if (request.action === "END_AUDIO_CAPTURE") {
    const session = tabId ? captureSessions.get(tabId) : null;
    if (session?.requestId === request.requestId) captureSessions.delete(tabId);
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "GET_CONTENT_PREFERENCES") {
    chrome.storage.local.get({ autoCopyClipboard: true })
      .then(({ autoCopyClipboard }) => sendResponse({
        success: true,
        autoCopyClipboard: autoCopyClipboard !== false
      }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "FETCH_EXTERNAL_AUDIO") {
    backgroundCore.fetchExternalAudio(request.url)
      .then((audio) => sendResponse({ success: true, ...audio }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "TRANSCRIBE_AUDIO") {
    const requestId = String(request.requestId || "");
    const controller = new AbortController();
    activeTranscriptions.set(requestId, controller);
    chrome.storage.local.get([
      "primaryProvider", "fallbackEnabled", "fallbackProviders", "providerModels", "providerMode",
      "geminiApiKey", "groqApiKey", "huggingfaceApiKey", "openaiApiKey", "xaiApiKey",
      "elevenLabsApiKey", "openrouterApiKey", "preferredModel", "customPrompt", "transcribeMode"
    ])
      .then((settings) => backgroundCore.transcribeAudio({
        base64Data: request.base64Data,
        mimeType: request.mimeType,
        settings,
        signal: controller.signal
      }))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }))
      .finally(() => activeTranscriptions.delete(requestId));
    return true;
  }

  if (request.action === "CANCEL_TRANSCRIPTION") {
    activeTranscriptions.get(String(request.requestId || ""))?.abort();
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "TEST_API_KEY") {
    chrome.storage.local.get(["preferredModel", "providerModels"])
      .then((settings) => backgroundCore.testProviderApiKey({
        provider: request.provider || "gemini",
        models: core.buildProviderModelOrder(
          request.provider || "gemini",
          settings.providerModels?.[request.provider || "gemini"] || core.buildModelOrder(settings.preferredModel)
        ),
        apiKey: String(request.apiKey || "").trim(),
        fetchImpl: fetch
      }))
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
