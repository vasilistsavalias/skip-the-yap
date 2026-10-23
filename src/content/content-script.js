(function runContentScript() {
  "use strict";

  if (globalThis.__voiceTranscriberLoaded) return;
  globalThis.__voiceTranscriberLoaded = true;

  const core = globalThis.VoiceTranscriberCore;
  const contentCore = globalThis.VoiceTranscriberContentCore;
  const instagramDocument = contentCore.isInstagramDocument(document);
  const PAGE_CAPTURE_START = "voice-transcriber:capture-start";
  const PAGE_CAPTURE_STOP = "voice-transcriber:capture-stop";
  const PAGE_SOURCE_FOUND = "voice-transcriber:source-found";
  const PAGE_AUDIO_DATA_FOUND = "voice-transcriber:audio-data-found";
  const SOURCE_DISCOVERY_TIMEOUT_MS = 3500;
  const transcribeButtons = new WeakMap();
  const activeCancellations = new WeakMap();
  const buttonAnchors = new Map();
  let positioningControls = false;

  function sendMessage(payload) {
    if (!chrome.runtime?.id) return Promise.reject(new Error("Refresh this tab to reconnect the extension."));
    return chrome.runtime.sendMessage(payload);
  }

  function showToast(message, type = "info") {
    let toast = document.querySelector(".vt-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "vt-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function placeVoiceNoteControls() {
    if (typeof document === "undefined" || !document.documentElement || !document.body) return;
    const viewportWidth = document.documentElement.clientWidth || globalThis.innerWidth || 0;
    const viewportHeight = document.documentElement.clientHeight || globalThis.innerHeight || 0;
    const controlGap = instagramDocument ? 46 : 8;

    for (const [button, container] of buttonAnchors) {
      if (!button.isConnected || !container.isConnected) {
        button.remove();
        buttonAnchors.delete(button);
        continue;
      }
      const anchor = contentCore.findVoiceAnchor(container);
      const rect = anchor.getBoundingClientRect();
      const outgoing = rect.left + rect.width / 2 > viewportWidth / 2;
      const preferredLeft = outgoing ? rect.left - 30 - controlGap : rect.right + controlGap;
      button.style.setProperty("left", `${Math.max(8, Math.min(preferredLeft, viewportWidth - 38))}px`, "important");
      button.style.setProperty("top", `${rect.top + rect.height / 2}px`, "important");
      button.hidden = rect.bottom < 0 || rect.top > viewportHeight;
    }

  }

  function scheduleControlPosition() {
    if (positioningControls) return;
    positioningControls = true;
    try {
      placeVoiceNoteControls();
    } finally {
      positioningControls = false;
    }
  }

  function createTranscriptionIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("vt-trigger-icon");
    for (const pathData of [
      "M9 2.25A2.75 2.75 0 0 0 6.25 5v3.5a2.75 2.75 0 0 0 5.5 0V5A2.75 2.75 0 0 0 9 2.25Z",
      "M3.75 8.25v.5a5.25 5.25 0 0 0 10.5 0v-.5M9 14v2.25M6.5 16.25h5"
    ]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }
    return svg;
  }

  function setTriggerState(button, state) {
    button.replaceChildren();
    if (state === "loading") {
      const spinner = document.createElement("span");
      spinner.className = "vt-trigger-spinner";
      spinner.setAttribute("aria-hidden", "true");
      button.append(spinner);
      button.dataset.state = "loading";
      return;
    }
    delete button.dataset.state;
    button.append(createTranscriptionIcon());
  }

  function mediaElementUrl(media) {
    return media?.currentSrc || media?.src || null;
  }

  function isUsableAudioSource(value, kind = "media") {
    return typeof value === "string" && (
      value.startsWith("blob:") ||
      value.startsWith("data:audio/") ||
      (kind === "network"
        ? core.looksLikeMediaUrl(value) || core.isMediaCdnUrl(value)
        : core.isAllowedMediaUrl(value))
    );
  }

  function beginPageCapture(requestId) {
    const media = [];
    const network = [];
    const inlineAudio = [];
    let resolveFirstSource;
    let resolveFirstAudio;
    const firstSource = new Promise((resolve) => { resolveFirstSource = resolve; });
    const firstAudio = new Promise((resolve) => { resolveFirstAudio = resolve; });
    const onSource = (event) => {
      const kind = event.detail?.kind === "media" ? "media" : "network";
      if (event.detail?.requestId !== requestId || !isUsableAudioSource(event.detail?.url, kind)) return;
      const target = kind === "media" ? media : network;
      if (!target.includes(event.detail.url)) {
        target.push(event.detail.url);
        resolveFirstSource(event.detail.url);
      }
    };
    const onAudioData = (event) => {
      const detail = event.detail;
      if (detail?.requestId !== requestId || typeof detail.base64Data !== "string" || typeof detail.mimeType !== "string") return;
      if (!inlineAudio.length) {
        inlineAudio.push({ base64Data: detail.base64Data, mimeType: detail.mimeType });
        resolveFirstAudio(inlineAudio[0]);
      }
    };
    globalThis.addEventListener(PAGE_SOURCE_FOUND, onSource);
    globalThis.addEventListener(PAGE_AUDIO_DATA_FOUND, onAudioData);
    globalThis.dispatchEvent(new CustomEvent(PAGE_CAPTURE_START, { detail: { requestId } }));
    return {
      media,
      network,
      inlineAudio,
      firstSource,
      firstAudio,
      stop() {
        globalThis.dispatchEvent(new CustomEvent(PAGE_CAPTURE_STOP, { detail: { requestId } }));
        globalThis.removeEventListener(PAGE_SOURCE_FOUND, onSource);
        globalThis.removeEventListener(PAGE_AUDIO_DATA_FOUND, onAudioData);
      }
    };
  }

  function collectPlayedMedia() {
    const urls = [];
    const elements = [];
    const onPlay = (event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      if (!elements.includes(event.target)) elements.push(event.target);
      const url = mediaElementUrl(event.target);
      if (isUsableAudioSource(url) && !urls.includes(url)) urls.push(url);
    };
    document.addEventListener("play", onPlay, true);
    return {
      urls,
      elements,
      stop() { document.removeEventListener("play", onPlay, true); }
    };
  }

  function stopSelectedPlayback(container, playedMedia) {
    container.querySelector("audio")?.pause();
    for (const media of playedMedia?.elements || []) media.pause();
    const control = contentCore.findPlayControl(container);
    const label = control?.getAttribute("aria-label") || "";
    if (/pause|παύση/i.test(label)) control.click();
  }

  async function resolveAudioSources(container, requestId) {
    const directMedia = container.querySelector("audio");
    const directUrl = mediaElementUrl(directMedia);
    if (isUsableAudioSource(directUrl) && !directUrl.startsWith("blob:")) {
      return { inlineAudio: null, urls: [directUrl] };
    }

    const started = await sendMessage({ action: "BEGIN_AUDIO_CAPTURE", requestId });
    if (!started?.success) throw new Error(started?.error || "Could not start audio capture.");
    const pageCapture = beginPageCapture(requestId);
    const playedMedia = collectPlayedMedia();

    try {
      const playControl = contentCore.findPlayControl(container);
      if (!playControl) throw new Error("Could not locate this voice note's play control.");

      playControl.click();
      const observedSource = await Promise.race([
        pageCapture.firstSource,
        new Promise((resolve) => setTimeout(() => resolve(null), SOURCE_DISCOVERY_TIMEOUT_MS))
      ]);
      if (observedSource?.startsWith("blob:")) {
        await Promise.race([
          pageCapture.firstAudio,
          new Promise((resolve) => setTimeout(resolve, 1800))
        ]);
      } else if (observedSource) {
        await Promise.race([
          pageCapture.firstAudio,
          new Promise((resolve) => setTimeout(resolve, 800))
        ]);
      }
      const captured = await sendMessage({ action: "GET_AUDIO_CAPTURE", requestId });
      const urls = [
        ...pageCapture.media,
        ...playedMedia.urls,
        ...pageCapture.network,
        ...(Array.isArray(captured?.urls)
          ? captured.urls.filter((url) => isUsableAudioSource(url, "network"))
          : [])
      ].filter((url, index, all) => all.indexOf(url) === index);
      if (pageCapture.inlineAudio.length || urls.length) {
        return { inlineAudio: pageCapture.inlineAudio[0] || null, urls };
      }
      throw new Error("This chat did not expose audio for the selected voice note. Refresh the conversation and try again.");
    } finally {
      stopSelectedPlayback(container, playedMedia);
      playedMedia.stop();
      pageCapture.stop();
      sendMessage({ action: "END_AUDIO_CAPTURE", requestId }).catch(() => {});
    }
  }

  async function audioUrlToBase64(url) {
    if (url.startsWith("blob:") || url.startsWith("data:")) {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read this voice note.");
      const blob = await response.blob();
      if (blob.size > core.MAX_AUDIO_BYTES) throw new Error("This voice note exceeds the 14 MB inline limit.");
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
        reader.onerror = () => reject(new Error("Could not convert this voice note."));
        reader.readAsDataURL(blob);
      });
      return { base64Data, mimeType: core.normalizeMimeType(blob.type) };
    }
    const result = await sendMessage({ action: "FETCH_EXTERNAL_AUDIO", url });
    if (!result?.success) throw new Error(result?.error || "Could not download this voice note.");
    return result;
  }

  async function audioSourcesToBase64(urls) {
    let lastError;
    for (const url of urls.slice(0, 6)) {
      try {
        return await audioUrlToBase64(url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("The chat exposed the voice note, but its audio could not be read.");
  }

  async function deliverTranscript(text) {
    let copyRequested = false;
    try {
      const preferences = await sendMessage({ action: "GET_CONTENT_PREFERENCES" });
      copyRequested = preferences?.success && preferences.autoCopyClipboard === true;
    } catch {
      copyRequested = false;
    }

    let composerReady = false;
    for (const delay of [0, 100, 250]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      composerReady = Boolean(contentCore.findComposer(document));
      if (composerReady) break;
    }
    const inserted = composerReady && await contentCore.insertTranscript(document, text);
    let copied = false;
    if (copyRequested || !inserted) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (inserted && copied) return "Transcript inserted and copied.";
    if (inserted) return "Transcript inserted into chat.";
    if (copied) return "Chat box not found; transcript copied instead.";
    throw new Error("Transcript ready, but the chat box and clipboard were unavailable.");
  }

  async function transcribe(container, triggerButton) {
    if (activeCancellations.has(container)) return;
    setTriggerState(triggerButton, "loading");
    triggerButton.setAttribute("aria-label", "Cancel transcription");
    triggerButton.title = "Cancel transcription";
    const requestId = core.createRequestId();
    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      triggerButton.setAttribute("aria-label", "Cancelling transcription");
      triggerButton.title = "Cancelling transcription";
      sendMessage({ action: "CANCEL_TRANSCRIPTION", requestId }).catch(() => {});
    };
    activeCancellations.set(container, cancel);
    const ensureActive = () => {
      if (!cancelled) return;
      const error = new Error("Transcription cancelled.");
      error.name = "TranscriptionCancelled";
      throw error;
    };

    try {
      const audioSources = await resolveAudioSources(container, requestId);
      ensureActive();
      const audio = audioSources.inlineAudio || await audioSourcesToBase64(audioSources.urls);
      ensureActive();
      core.validateAudioPayload(audio.base64Data, audio.mimeType);
      const result = await sendMessage({
        action: "TRANSCRIBE_AUDIO",
        requestId,
        base64Data: audio.base64Data,
        mimeType: audio.mimeType
      });
      ensureActive();
      if (!result?.success) throw new Error(result?.error || "The configured providers could not transcribe this voice note.");
      const deliveryMessage = await deliverTranscript(result.text);
      showToast(deliveryMessage, "success");
    } catch (error) {
      if (cancelled || error.name === "TranscriptionCancelled") {
        showToast("Transcription cancelled.");
      } else {
        showToast(error.message, "error");
      }
    } finally {
      activeCancellations.delete(container);
      setTriggerState(triggerButton, "idle");
      triggerButton.setAttribute("aria-label", "Transcribe voice note");
      triggerButton.title = `Transcribe voice note${contentCore.findDuration(container) ? ` (${contentCore.findDuration(container)})` : ""}`;
    }
  }

  function mountButton(container) {
    if (transcribeButtons.get(container)?.isConnected) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vt-transcribe-trigger vt-page-trigger";
    button.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      const cancel = activeCancellations.get(container);
      if (cancel) {
        cancel();
        return;
      }
      transcribe(container, button);
    });
    setTriggerState(button, "idle");
    button.setAttribute("aria-label", "Transcribe voice note");
    button.title = `Transcribe voice note${contentCore.findDuration(container) ? ` (${contentCore.findDuration(container)})` : ""}`;
    document.body.append(button);
    buttonAnchors.set(button, container);
    scheduleControlPosition();
    transcribeButtons.set(container, button);
  }

  function scan(root) {
    const controls = [];
    const controlSelector = instagramDocument
      ? `${contentCore.PLAY_CONTROL_SELECTOR}, ${contentCore.INSTAGRAM_CONTROL_SELECTOR}`
      : contentCore.PLAY_CONTROL_SELECTOR;
    if (root.matches?.(controlSelector)) controls.push(root);
    const descendantSelector = instagramDocument ? controlSelector : `${controlSelector}, audio`;
    controls.push(...(root.querySelectorAll?.(descendantSelector) || []));
    for (const control of controls) {
      if (control.closest?.(".vt-transcribe-trigger")) continue;
      const container = control.tagName === "AUDIO"
        ? contentCore.findVoiceContainer(control) || control.parentElement
        : contentCore.findVoiceContainer(control);
      if (instagramDocument && contentCore.findPlayControl(container) !== control) continue;
      if (contentCore.isVoiceContainer(container)) mountButton(container);
    }
  }

  const observer = new MutationObserver((mutations) => {
    const changedRoots = new Set();
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (!mutation.target.closest?.(".vt-transcribe-trigger, .vt-toast")) {
          changedRoots.add(mutation.target);
        }
        continue;
      }

      const relevantNodes = [...mutation.addedNodes].filter((node) => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return !element?.closest?.(".vt-transcribe-trigger, .vt-toast");
      });
      if (relevantNodes.length && mutation.target.nodeType === Node.ELEMENT_NODE) {
        changedRoots.add(mutation.target);
      }
      for (const node of relevantNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) changedRoots.add(node);
      }
    }
    for (const root of changedRoots) scan(root);
    scheduleControlPosition();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "role"]
  });

  document.addEventListener("scroll", scheduleControlPosition, true);
  globalThis.addEventListener("resize", scheduleControlPosition);
  globalThis.addEventListener("unload", () => {
    observer.disconnect();
    buttonAnchors.clear();
  }, { once: true });

  scan(document);
})();
