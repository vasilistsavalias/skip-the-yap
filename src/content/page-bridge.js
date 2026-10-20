(function installVoiceTranscriberPageBridge() {
  "use strict";

  if (globalThis.__voiceTranscriberPageBridgeLoaded) return;
  Object.defineProperty(globalThis, "__voiceTranscriberPageBridgeLoaded", { value: true });

  const CAPTURE_START = "voice-transcriber:capture-start";
  const CAPTURE_STOP = "voice-transcriber:capture-stop";
  const SOURCE_FOUND = "voice-transcriber:source-found";
  const AUDIO_DATA_FOUND = "voice-transcriber:audio-data-found";
  const CAPTURE_WINDOW_MS = 4000;
  const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
  let capture = null;

  const originalFetch = globalThis.fetch;

  async function emitAudioData(blob, mimeType, current) {
    if (!blob.size || blob.size > MAX_AUDIO_BYTES) return;
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    globalThis.dispatchEvent(new CustomEvent(AUDIO_DATA_FOUND, {
      detail: {
        requestId: current.requestId,
        base64Data,
        mimeType: blob.type || mimeType || "audio/mp4"
      }
    }));
  }

  async function reportBlobData(url, current) {
    if (typeof originalFetch !== "function" || current.audioReads.has(url)) return;
    current.audioReads.add(url);
    try {
      const response = await Reflect.apply(originalFetch, globalThis, [url]);
      if (response.ok) await emitAudioData(await response.blob(), "audio/mp4", current);
    } catch {
      // A captured network response may still provide the audio.
    }
  }

  async function reportFetchResponse(response, url, current) {
    const readKey = `fetch:${url}`;
    if (!response?.ok || typeof response.clone !== "function" || current.audioReads.has(readKey)) return;
    if (response.status === 206 || response.headers?.get?.("content-range")) return;
    const mimeType = response.headers?.get?.("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
    if (!/^(audio\/|video\/mp4$)/.test(mimeType)) return;
    const declaredSize = Number(response.headers?.get?.("content-length") || 0);
    if (declaredSize > MAX_AUDIO_BYTES) return;
    current.audioReads.add(readKey);
    try {
      await emitAudioData(await response.clone().blob(), mimeType, current);
    } catch {
      // Background download remains available as a fallback.
    }
  }

  function restoreMutedMedia() {
    if (!capture) return;
    for (const [media, wasMuted] of capture.mutedMedia) {
      media.muted = wasMuted;
    }
  }

  function rememberAndMute(media, current) {
    if (!current.mutedMedia.has(media)) current.mutedMedia.set(media, media.muted);
    media.muted = true;
  }

  function stopCapture(requestId) {
    if (!capture || capture.requestId !== requestId) return;
    restoreMutedMedia();
    capture = null;
  }

  function activeCapture() {
    if (!capture) return null;
    if (Date.now() <= capture.expiresAt) return capture;
    stopCapture(capture.requestId);
    return null;
  }

  function reportSource(value, kind) {
    const current = activeCapture();
    const url = typeof value === "string" ? value : value?.url;
    if (!current || !url) return;
    globalThis.dispatchEvent(new CustomEvent(SOURCE_FOUND, {
      detail: { requestId: current.requestId, url, kind }
    }));
    if (url.startsWith("blob:")) reportBlobData(url, current);
  }

  globalThis.addEventListener(CAPTURE_START, (event) => {
    const requestId = event.detail?.requestId;
    if (typeof requestId !== "string" || !requestId || requestId.length > 100) return;
    restoreMutedMedia();
    capture = {
      requestId,
      expiresAt: Date.now() + CAPTURE_WINDOW_MS,
      mutedMedia: new Map(),
      audioReads: new Set()
    };
    for (const media of document.querySelectorAll("audio")) rememberAndMute(media, capture);
  });

  globalThis.addEventListener(CAPTURE_STOP, (event) => stopCapture(event.detail?.requestId));

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function voiceTranscriberObservedPlay(...args) {
    const current = activeCapture();
    if (current) {
      rememberAndMute(this, current);
      reportSource(this.currentSrc || this.src, "media");
    }
    const result = Reflect.apply(originalPlay, this, args);
    if (current) {
      Promise.resolve(result).then(() => {
        if (capture?.requestId === current.requestId) this.pause();
      }).catch(() => {});
    }
    return result;
  };

  if (typeof originalFetch === "function") {
    globalThis.fetch = function voiceTranscriberObservedFetch(...args) {
      const current = activeCapture();
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      reportSource(args[0], "network");
      const response = Reflect.apply(originalFetch, this, args);
      if (current && url) {
        Promise.resolve(response).then((value) => reportFetchResponse(value, url, current)).catch(() => {});
      }
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function voiceTranscriberObservedOpen(method, url, ...rest) {
    reportSource(url, "network");
    return Reflect.apply(originalOpen, this, [method, url, ...rest]);
  };
})();
