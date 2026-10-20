(function exposeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VoiceTranscriberCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
  const SUPPORTED_AUDIO_MIME_TYPES = Object.freeze([
    "audio/aac", "audio/flac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/opus", "audio/wav", "audio/webm"
  ]);
  const PROVIDERS = Object.freeze(["gemini", "groq", "huggingface", "openai", "xai", "elevenlabs", "openrouter"]);
  const MODEL_CASCADE = Object.freeze([
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
  ]);
  const PROVIDER_MODELS = Object.freeze({
    gemini: MODEL_CASCADE,
    groq: Object.freeze(["whisper-large-v3-turbo", "whisper-large-v3"]),
    huggingface: Object.freeze(["openai/whisper-large-v3-turbo", "openai/whisper-large-v3"]),
    openai: Object.freeze(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]),
    xai: Object.freeze(["xai-stt"]),
    elevenlabs: Object.freeze(["scribe_v2"]),
    openrouter: Object.freeze(["openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe", "openai/whisper-1"])
  });
  const PROVIDER_ORIGINS = Object.freeze({
    gemini: Object.freeze(["https://generativelanguage.googleapis.com/*"]),
    groq: Object.freeze(["https://api.groq.com/*"]),
    huggingface: Object.freeze(["https://router.huggingface.co/*", "https://huggingface.co/*"]),
    openai: Object.freeze(["https://api.openai.com/*"]),
    xai: Object.freeze(["https://api.x.ai/*"]),
    elevenlabs: Object.freeze(["https://api.elevenlabs.io/*"]),
    openrouter: Object.freeze(["https://openrouter.ai/*"])
  });
  const MEDIA_HOSTS = Object.freeze([
    "messenger.com",
    "facebook.com",
    "instagram.com",
    "fbsbx.com",
    "cdninstagram.com",
    "fbcdn.net"
  ]);
  const MEDIA_CDN_HOSTS = Object.freeze(["fbsbx.com", "cdninstagram.com", "fbcdn.net"]);
  const RETRYABLE_STATUS_CODES = new Set([404, 408, 429, 500, 502, 503, 504]);
  const PROMPTS = Object.freeze({
    verbatim: "Accurately transcribe this voice message in the exact language spoken. Do not translate. Preserve colloquialisms, filler words, and slang. Add appropriate capitalization and punctuation. Return only the transcript.",
    clean: "Transcribe this voice message in the exact language spoken. Do not translate. Remove stutters, hesitations, and empty filler while preserving meaning, vocabulary, and phrasing. Return only the cleaned transcript.",
    summary: "Summarize this voice message in the exact language spoken. Do not translate. Return one to three concise bullet points covering the main message, requests, or questions."
  });

  function normalizeMimeType(value) {
    const mimeType = String(value || "audio/mp4").split(";", 1)[0].trim().toLowerCase();
    return {
      "application/ogg": "audio/ogg",
      "audio/m4a": "audio/mp4",
      "audio/mp3": "audio/mpeg",
      "audio/wave": "audio/wav",
      "audio/x-flac": "audio/flac",
      "audio/x-m4a": "audio/mp4",
      "audio/x-wav": "audio/wav",
      "video/mp4": "audio/mp4"
    }[mimeType] || mimeType;
  }

  function decodeBase64Prefix(base64Data, byteLimit = 16) {
    try {
      const clean = String(base64Data || "").replace(/\s/g, "");
      const prefix = atob(clean.slice(0, Math.ceil(byteLimit / 3) * 4));
      return Uint8Array.from(prefix.slice(0, byteLimit), (character) => character.charCodeAt(0));
    } catch {
      throw new Error("The selected voice note contained invalid audio data.");
    }
  }

  function detectAudioMimeType(base64Data) {
    const bytes = decodeBase64Prefix(base64Data);
    const ascii = String.fromCharCode(...bytes);
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
    if (ascii.startsWith("OggS")) return "audio/ogg";
    if (ascii.startsWith("fLaC")) return "audio/flac";
    if (ascii.slice(4, 8) === "ftyp") return "audio/mp4";
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
    if (ascii.startsWith("ID3")) return "audio/mpeg";
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return null;
    const trimmed = ascii.trimStart().toLowerCase();
    if (trimmed.startsWith("<html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      throw new Error("The selected voice-note response was not audio.");
    }
    return null;
  }

  function estimateBase64Bytes(base64Data) {
    const value = String(base64Data || "").replace(/\s/g, "");
    if (!value) return 0;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return Math.floor((value.length * 3) / 4) - padding;
  }

  function validateAudioPayload(base64Data, mimeType) {
    let cleanMime = normalizeMimeType(mimeType);
    if (!base64Data || typeof base64Data !== "string") {
      throw new Error("The selected voice note did not contain audio data.");
    }
    const bytes = estimateBase64Bytes(base64Data);
    if (bytes <= 0) throw new Error("The selected voice note was empty.");
    if (bytes > MAX_AUDIO_BYTES) {
      throw new Error("This voice note is too large for inline transcription (14 MB maximum).");
    }
    cleanMime = detectAudioMimeType(base64Data) || cleanMime;
    if (!SUPPORTED_AUDIO_MIME_TYPES.includes(cleanMime)) {
      throw new Error(`Unsupported audio type: ${cleanMime}`);
    }
    return { bytes, mimeType: cleanMime };
  }

  function isAllowedMediaUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      const hostname = url.hostname.toLowerCase();
      return MEDIA_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  function looksLikeMediaUrl(value) {
    if (!isAllowedMediaUrl(value)) return false;
    const text = value.toLowerCase();
    return /\.(m4a|mp3|mp4|ogg|opus|wav)(?:[?#]|$)/.test(text) ||
      text.includes("/audio") || text.includes("bytestart") || text.includes("mime_type=audio");
  }

  function isMediaCdnUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      const hostname = url.hostname.toLowerCase();
      return MEDIA_CDN_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  function buildModelOrder(preferredModel) {
    if (!preferredModel || preferredModel === "auto") return [...MODEL_CASCADE];
    if (!MODEL_CASCADE.includes(preferredModel)) return [...MODEL_CASCADE];
    return [preferredModel, ...MODEL_CASCADE.filter((model) => model !== preferredModel)];
  }

  function normalizeProviderMode(value) {
    return value === "auto" || PROVIDERS.includes(value) ? value : "gemini";
  }

  function normalizeProvider(value) {
    return PROVIDERS.includes(value) ? value : "gemini";
  }

  function buildProviderModelOrder(provider, configuredModels) {
    const defaults = PROVIDER_MODELS[normalizeProvider(provider)] || [];
    if (!Array.isArray(configuredModels)) return [...defaults];
    const selected = configuredModels.filter((model, index) => defaults.includes(model) && configuredModels.indexOf(model) === index);
    return selected.length ? selected : [...defaults];
  }

  function resolveProviderOrder(settings = {}) {
    if (settings.primaryProvider) {
      const primary = normalizeProvider(settings.primaryProvider);
      if (!settings.fallbackEnabled) return [primary];
      const fallbacks = Array.isArray(settings.fallbackProviders)
        ? settings.fallbackProviders.filter((provider, index, values) => PROVIDERS.includes(provider) && provider !== primary && values.indexOf(provider) === index)
        : [];
      return [primary, ...fallbacks];
    }

    const oldMode = normalizeProviderMode(settings.providerMode);
    if (oldMode !== "auto") return [oldMode];
    return PROVIDERS.filter((provider) => settings[`${provider === "elevenlabs" ? "elevenLabs" : provider}ApiKey`]);
  }

  function isRetryableStatus(status) {
    return RETRYABLE_STATUS_CODES.has(Number(status));
  }

  function getPrompt(settings) {
    const customPrompt = String(settings.customPrompt || "").trim();
    if (customPrompt) return customPrompt.slice(0, 4000);
    return PROMPTS[settings.transcribeMode] || PROMPTS.verbatim;
  }

  function createRequestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  return {
    MAX_AUDIO_BYTES,
    MEDIA_HOSTS,
    MODEL_CASCADE,
    PROVIDERS,
    PROVIDER_MODELS,
    PROVIDER_ORIGINS,
    PROMPTS,
    SUPPORTED_AUDIO_MIME_TYPES,
    buildModelOrder,
    buildProviderModelOrder,
    createRequestId,
    detectAudioMimeType,
    estimateBase64Bytes,
    getPrompt,
    isAllowedMediaUrl,
    isMediaCdnUrl,
    isRetryableStatus,
    looksLikeMediaUrl,
    normalizeMimeType,
    normalizeProvider,
    normalizeProviderMode,
    resolveProviderOrder,
    validateAudioPayload
  };
});
