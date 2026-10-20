(function exposeBackgroundCore(root, factory) {
  const core = typeof module === "object" && module.exports
    ? require("../shared/core.js")
    : root.VoiceTranscriberCore;
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VoiceTranscriberBackgroundCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBackgroundCore(core) {
  "use strict";

  class GeminiRequestError extends Error {
    constructor(message, status = 0, retryAfterMs = 0, retryable = false) {
      super(message);
      this.name = "GeminiRequestError";
      this.status = status;
      this.retryAfterMs = retryAfterMs;
      this.retryable = retryable;
    }
  }

  class ProviderRequestError extends Error {
    constructor(message, status = 0, retryable = false) {
      super(message);
      this.name = "ProviderRequestError";
      this.status = status;
      this.retryable = retryable;
    }
  }

  function getRetryAfterMs(response) {
    const value = response.headers.get("retry-after");
    if (!value) return 0;

    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const date = Date.parse(value);
    return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
  }

  function isRetryableRequestError(error) {
    return error?.retryable || core.isRetryableStatus(error?.status) || error?.name === "AbortError" || error?.name === "TypeError";
  }

  function wait(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(new DOMException("The transcription was cancelled.", "AbortError"));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("The transcription was cancelled.", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  function base64ToBlob(base64Data, mimeType) {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  }

  function audioFileName(mimeType) {
    const extension = {
      "audio/aac": "aac",
      "audio/flac": "flac",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/wav": "wav",
      "audio/webm": "webm"
    }[mimeType] || "audio";
    return `voice-note.${extension}`;
  }

  async function readProviderError(response, fallback) {
    const body = await response.json().catch(() => ({}));
    return body.error?.message || (typeof body.error === "string" ? body.error : "") || body.message || body.detail?.message || (typeof body.detail === "string" ? body.detail : "") || fallback;
  }

  async function fetchWithTimeout(url, options, fetchImpl, timeoutMs, signal) {
    if (signal?.aborted) throw new DOMException("The transcription was cancelled.", "AbortError");
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw new DOMException("The transcription was cancelled.", "AbortError");
      if (timedOut || error?.name === "AbortError") {
        throw new ProviderRequestError("The transcription provider timed out.", 408, true);
      }
      if (error?.name === "TypeError") throw new ProviderRequestError(error.message, 0, true);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  function createAudioForm(audioBlob, mimeType, fields) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append("file", audioBlob, audioFileName(mimeType));
    return form;
  }

  function prepareAudio(input, includeBlob = false) {
    if (!input.validatedAudio) {
      input.validatedAudio = core.validateAudioPayload(input.base64Data, input.mimeType);
      input.mimeType = input.validatedAudio.mimeType;
    }
    if (includeBlob && !input.audioBlob) {
      input.audioBlob = base64ToBlob(input.base64Data, input.validatedAudio.mimeType);
    }
    return input;
  }

  async function fetchExternalAudio(url, fetchImpl = fetch) {
    if (!core.isAllowedMediaUrl(url)) throw new Error("Blocked an untrusted media URL.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) throw new Error(`Could not download voice note (HTTP ${response.status}).`);
      if (response.url && !core.isAllowedMediaUrl(response.url)) {
        throw new Error("Blocked a media download that redirected to an untrusted host.");
      }

      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > core.MAX_AUDIO_BYTES) {
        throw new Error("This voice note is too large for inline transcription (14 MB maximum).");
      }

      const blob = await response.blob();
      if (blob.size > core.MAX_AUDIO_BYTES) {
        throw new Error("This voice note is too large for inline transcription (14 MB maximum).");
      }
      const base64Data = arrayBufferToBase64(await blob.arrayBuffer());
      const validatedAudio = core.validateAudioPayload(base64Data, blob.type);
      return { base64Data, mimeType: validatedAudio.mimeType };
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError" || /signal is aborted/i.test(error?.message || "")) {
        throw new Error("Timed out while downloading this voice note from the chat service.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestTranscript({ model, apiKey, base64Data, mimeType, prompt, fetchImpl, timeoutMs, signal }) {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    const abortForTimeout = () => {
      timedOut = true;
      controller.abort();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(abortForTimeout, timeoutMs);
    try {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Data } },
                { text: prompt }
              ]
            }]
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error?.message || `Gemini request failed (HTTP ${response.status}).`;
        throw new GeminiRequestError(message, response.status, getRetryAfterMs(response));
      }
      const result = await response.json();
      const transcript = result.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();
      if (!transcript) {
        const blockReason = result.promptFeedback?.blockReason;
        const finishReason = result.candidates?.[0]?.finishReason;
        if (blockReason && blockReason !== "BLOCK_REASON_UNSPECIFIED") {
          throw new GeminiRequestError(`Gemini blocked this audio request (${blockReason}).`, 422);
        }
        if (finishReason && !["STOP", "MAX_TOKENS", "FINISH_REASON_UNSPECIFIED"].includes(finishReason)) {
          throw new GeminiRequestError(`Gemini could not transcribe this audio (${finishReason}).`, 422);
        }
        throw new GeminiRequestError("Gemini returned an empty transcript.", 422, 0, true);
      }
      return transcript;
    } catch (error) {
      if (timedOut) {
        throw new GeminiRequestError(`${model} timed out while transcribing.`, 408);
      }
      if (signal?.aborted) {
        throw new DOMException("The transcription was cancelled.", "AbortError");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  async function testApiKey({ apiKey, models = core.buildModelOrder("auto"), fetchImpl = fetch, timeoutMs = 5000 }) {
    const key = String(apiKey || "").trim();
    if (!key) throw new Error("Enter a Gemini API key first.");
    const deadline = Date.now() + 15000;
    let lastError;

    for (const model of models) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.min(timeoutMs, remaining));
      try {
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK." }] }] }),
            signal: controller.signal
          }
        );
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new GeminiRequestError(errorBody.error?.message || `Connection test failed (HTTP ${response.status}).`, response.status);
        }
        return true;
      } catch (error) {
        lastError = timedOut
          ? new GeminiRequestError(`${model} timed out during the connection test.`, 408)
          : error;
        if (!isRetryableRequestError(lastError)) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new GeminiRequestError(
      "Could not reach any configured Gemini model. Check your connection and try again.",
      lastError?.status
    );
  }

  async function requestGroqTranscript({ apiKey, model, audioBlob, mimeType, fetchImpl, signal }) {
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: createAudioForm(audioBlob, mimeType, {
          model,
          response_format: "json",
          temperature: "0"
        })
      },
      fetchImpl,
      15000,
      signal
    );
    if (!response.ok) {
      const message = await readProviderError(response, `Groq transcription failed (HTTP ${response.status}).`);
      throw new ProviderRequestError(message, response.status, core.isRetryableStatus(response.status));
    }
    const result = await response.json();
    const text = String(result.text || "").trim();
    if (!text) throw new ProviderRequestError("Groq returned an empty transcript.", 422, true);
    return text;
  }

  async function postProcessWithGroq({ apiKey, transcript, settings, fetchImpl, signal }) {
    const instruction = String(settings.customPrompt || "").trim().slice(0, 4000) || {
      clean: "Clean this transcript without translating it. Remove stutters, hesitations, and empty filler while preserving meaning and phrasing. Add appropriate punctuation. Return only the cleaned transcript.",
      summary: "Summarize this transcript in its original language. Return one to three concise bullet points covering the main message, requests, or questions."
    }[settings.transcribeMode];
    if (!instruction) return transcript;

    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          temperature: 0,
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: transcript }
          ]
        })
      },
      fetchImpl,
      10000,
      signal
    );
    if (!response.ok) {
      const message = await readProviderError(response, `Groq text processing failed (HTTP ${response.status}).`);
      throw new ProviderRequestError(message, response.status, core.isRetryableStatus(response.status));
    }
    const result = await response.json();
    const text = String(result.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new ProviderRequestError("Groq returned empty processed text.", 422, true);
    return text;
  }

  async function transcribeWithGroq(input, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const apiKey = String(input.settings?.groqApiKey || "").trim();
    if (!apiKey) throw new Error("Add your Groq API key in the extension popup first.");
    const prepared = prepareAudio(input, true);
    const models = core.buildProviderModelOrder("groq", input.settings?.providerModels?.groq);
    let lastError;
    let transcript;
    let modelUsed;
    for (const model of models) {
      try {
        transcript = await requestGroqTranscript({
          apiKey,
          model,
          audioBlob: prepared.audioBlob,
          mimeType: prepared.validatedAudio.mimeType,
          fetchImpl,
          signal: input.signal
        });
        modelUsed = model;
        break;
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || !isRetryableRequestError(error)) throw error;
      }
    }
    if (!transcript) throw lastError || new Error("Groq could not transcribe this voice note.");
    const text = await postProcessWithGroq({ apiKey, transcript, settings: input.settings || {}, fetchImpl, signal: input.signal });
    return { text, modelUsed, providerUsed: "groq", modeUsed: input.settings?.transcribeMode || "verbatim" };
  }

  async function transcribeWithElevenLabs(input, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const settings = input.settings || {};
    const apiKey = String(settings.elevenLabsApiKey || "").trim();
    if (!apiKey) throw new Error("Add your ElevenLabs API key in the extension popup first.");
    if ((settings.transcribeMode || "verbatim") !== "verbatim" || String(settings.customPrompt || "").trim()) {
      throw new ProviderRequestError("ElevenLabs does not support Cleaned, TL;DR, or custom prompt modes here. Use Verbatim or configure Gemini/Groq for text processing.", 422);
    }
    const prepared = prepareAudio(input, true);
    const response = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: createAudioForm(prepared.audioBlob, prepared.validatedAudio.mimeType, {
          model_id: core.buildProviderModelOrder("elevenlabs", settings.providerModels?.elevenlabs)[0],
          tag_audio_events: "false",
          diarize: "false"
        })
      },
      fetchImpl,
      20000,
      input.signal
    );
    if (!response.ok) {
      const message = await readProviderError(response, `ElevenLabs transcription failed (HTTP ${response.status}).`);
      throw new ProviderRequestError(message, response.status, core.isRetryableStatus(response.status));
    }
    const result = await response.json();
    const text = String(result.text || "").trim();
    if (!text) throw new ProviderRequestError("ElevenLabs returned an empty transcript.", 422, true);
    return { text, modelUsed: "scribe-v2", providerUsed: "elevenlabs", modeUsed: "verbatim" };
  }

  async function transcribeWithOpenAiCompatible(input, provider, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const settings = input.settings || {};
    const config = {
      openai: { key: "openaiApiKey", url: "https://api.openai.com/v1/audio/transcriptions" },
      openrouter: { key: "openrouterApiKey", url: "https://openrouter.ai/api/v1/audio/transcriptions" }
    }[provider];
    const apiKey = String(settings[config.key] || "").trim();
    if (!apiKey) throw new Error(`Add your ${provider === "openai" ? "OpenAI" : "OpenRouter"} API key in the extension popup first.`);
    if ((settings.transcribeMode || "verbatim") !== "verbatim" || String(settings.customPrompt || "").trim()) {
      throw new ProviderRequestError(`${provider === "openai" ? "OpenAI" : "OpenRouter"} supports Verbatim mode in this extension. Choose Verbatim or use Gemini/Groq for processed text.`, 422);
    }
    const prepared = prepareAudio(input, true);
    const models = core.buildProviderModelOrder(provider, settings.providerModels?.[provider]);
    let lastError;
    for (const model of models) {
      try {
        const response = await fetchWithTimeout(config.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: createAudioForm(prepared.audioBlob, prepared.validatedAudio.mimeType, { model, response_format: "json" })
        }, fetchImpl, 20000, input.signal);
        if (!response.ok) {
          const message = await readProviderError(response, `${provider} transcription failed (HTTP ${response.status}).`);
          throw new ProviderRequestError(message, response.status, core.isRetryableStatus(response.status));
        }
        const result = await response.json();
        const text = String(result.text || "").trim();
        if (!text) throw new ProviderRequestError(`${provider} returned an empty transcript.`, 422, true);
        return { text, modelUsed: model, providerUsed: provider, modeUsed: "verbatim" };
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || !isRetryableRequestError(error)) throw error;
      }
    }
    throw lastError || new Error(`${provider} could not transcribe this voice note.`);
  }

  async function transcribeWithXai(input, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const settings = input.settings || {};
    const apiKey = String(settings.xaiApiKey || "").trim();
    if (!apiKey) throw new Error("Add your xAI API key in the extension popup first.");
    if ((settings.transcribeMode || "verbatim") !== "verbatim" || String(settings.customPrompt || "").trim()) {
      throw new ProviderRequestError("xAI supports Verbatim mode in this extension. Choose Verbatim or use Gemini/Groq for processed text.", 422);
    }
    const prepared = prepareAudio(input, true);
    const response = await fetchWithTimeout("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: createAudioForm(prepared.audioBlob, prepared.validatedAudio.mimeType, { filler_words: "true" })
    }, fetchImpl, 20000, input.signal);
    if (!response.ok) throw new ProviderRequestError(await readProviderError(response, `xAI transcription failed (HTTP ${response.status}).`), response.status, core.isRetryableStatus(response.status));
    const result = await response.json();
    const text = String(result.text || result.transcript || "").trim();
    if (!text) throw new ProviderRequestError("xAI returned an empty transcript.", 422, true);
    return { text, modelUsed: "xai-stt", providerUsed: "xai", modeUsed: "verbatim" };
  }

  async function transcribeWithHuggingFace(input, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const settings = input.settings || {};
    const apiKey = String(settings.huggingfaceApiKey || "").trim();
    if (!apiKey) throw new Error("Add your Hugging Face token in the extension popup first.");
    if ((settings.transcribeMode || "verbatim") !== "verbatim" || String(settings.customPrompt || "").trim()) {
      throw new ProviderRequestError("Hugging Face supports Verbatim mode in this extension. Choose Verbatim or use Gemini/Groq for processed text.", 422);
    }
    const prepared = prepareAudio(input, true);
    const models = core.buildProviderModelOrder("huggingface", settings.providerModels?.huggingface);
    let lastError;
    for (const model of models) {
      try {
        const response = await fetchWithTimeout(`https://router.huggingface.co/hf-inference/models/${model}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": prepared.validatedAudio.mimeType },
          body: prepared.audioBlob
        }, fetchImpl, 30000, input.signal);
        if (!response.ok) throw new ProviderRequestError(await readProviderError(response, `Hugging Face transcription failed (HTTP ${response.status}).`), response.status, core.isRetryableStatus(response.status));
        const result = await response.json();
        const text = String(result.text || "").trim();
        if (!text) throw new ProviderRequestError("Hugging Face returned an empty transcript.", 422, true);
        return { text, modelUsed: model, providerUsed: "huggingface", modeUsed: "verbatim" };
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || !isRetryableRequestError(error)) throw error;
      }
    }
    throw lastError || new Error("Hugging Face could not transcribe this voice note.");
  }

  async function transcribeWithGemini(input, dependencies = {}, options = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const now = dependencies.now || Date.now;
    const settings = input.settings || {};
    const apiKey = String(settings.geminiApiKey || "").trim();
    if (!apiKey) throw new Error("Add your Gemini API key in the extension popup first.");

    const prepared = prepareAudio(input);
    const models = core.buildProviderModelOrder("gemini", settings.providerModels?.gemini || core.buildModelOrder(settings.preferredModel));
    const deadlineMs = options.deadlineMs || 45000;
    const passes = options.passes || 2;
    const deadline = now() + deadlineMs;
    const modelTimeoutMs = 10000;
    let lastError;
    let attempts = 0;

    for (let pass = 0; pass < passes; pass += 1) {
      for (const model of models) {
        const remaining = deadline - now();
        if (remaining <= 0) break;
        attempts += 1;
        try {
          const text = await requestTranscript({
            model,
            apiKey,
            base64Data: input.base64Data,
            mimeType: prepared.validatedAudio.mimeType,
            prompt: core.getPrompt(settings),
            fetchImpl,
            timeoutMs: Math.min(modelTimeoutMs, remaining),
            signal: input.signal
          });
          return { text, modelUsed: model, providerUsed: "gemini", modeUsed: settings.transcribeMode || "verbatim" };
        } catch (error) {
          lastError = error;
          if (input.signal?.aborted || !isRetryableRequestError(error)) throw error;
        }
      }

      if (pass < passes - 1 && deadline > now()) {
        const retryDelay = Math.min(Math.max(lastError?.retryAfterMs || 500, 500), 5000, deadline - now());
        await wait(retryDelay, input.signal);
      }
    }

    if (!lastError) throw new Error("Transcription timed out before Gemini returned a result.");
    const exhaustedByTime = attempts < models.length;
    const message = exhaustedByTime
      ? `Gemini did not respond within ${Math.round(deadlineMs / 1000)} seconds after ${attempts} model attempts. Google's free tier may be busy or rate-limited; try again shortly.`
      : `No Gemini model returned a transcript after ${attempts} attempts. Google's free tier may be busy or rate-limited; try again shortly.`;
    throw new GeminiRequestError(message, lastError.status, 0, isRetryableRequestError(lastError));
  }

  async function transcribeAudio(input, dependencies = {}) {
    const settings = input.settings || {};
    const providerKey = {
      gemini: "geminiApiKey", groq: "groqApiKey", huggingface: "huggingfaceApiKey", openai: "openaiApiKey",
      xai: "xaiApiKey", elevenlabs: "elevenLabsApiKey", openrouter: "openrouterApiKey"
    };
    const requestedProviders = core.resolveProviderOrder(settings);
    const providers = settings.fallbackEnabled
      ? requestedProviders.filter((provider) => String(settings[providerKey[provider]] || "").trim())
      : requestedProviders;
    if (!providers.length) throw new Error("Add at least one provider API key in the extension popup first.");
    const preparedInput = prepareAudio({ ...input });
    let lastError;

    for (const provider of providers) {
      if (providers.length > 1 && !["gemini", "groq"].includes(provider) && ((settings.transcribeMode || "verbatim") !== "verbatim" || String(settings.customPrompt || "").trim())) {
        continue;
      }
      try {
        if (provider === "gemini") {
          const sharedFallback = providers.length > 1;
          return await transcribeWithGemini(preparedInput, dependencies, sharedFallback ? { deadlineMs: 25000, passes: 1 } : {});
        }
        if (provider === "groq") return await transcribeWithGroq(preparedInput, dependencies);
        if (provider === "elevenlabs") return await transcribeWithElevenLabs(preparedInput, dependencies);
        if (provider === "openai" || provider === "openrouter") return await transcribeWithOpenAiCompatible(preparedInput, provider, dependencies);
        if (provider === "xai") return await transcribeWithXai(preparedInput, dependencies);
        if (provider === "huggingface") return await transcribeWithHuggingFace(preparedInput, dependencies);
      } catch (error) {
        if (input.signal?.aborted) throw error;
        if (!isRetryableRequestError(error) && ![401, 403].includes(error?.status)) throw error;
        lastError = error;
      }
    }

    throw lastError || new Error("No configured provider supports the selected transcription mode.");
  }

  async function testProviderApiKey({ provider, apiKey, models, fetchImpl = fetch, timeoutMs = 5000 }) {
    if (provider === "gemini") return testApiKey({ apiKey, models, fetchImpl, timeoutMs });
    const key = String(apiKey || "").trim();
    if (!key) throw new Error("Enter an API key first.");
    const config = {
      groq: { url: "https://api.groq.com/openai/v1/models", headers: { Authorization: `Bearer ${key}` } },
      elevenlabs: { url: "https://api.elevenlabs.io/v1/user/subscription", headers: { "xi-api-key": key } },
      openai: { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${key}` } },
      openrouter: { url: "https://openrouter.ai/api/v1/models", headers: { Authorization: `Bearer ${key}` } },
      xai: { url: "https://api.x.ai/v1/models", headers: { Authorization: `Bearer ${key}` } },
      huggingface: { url: "https://huggingface.co/api/whoami-v2", headers: { Authorization: `Bearer ${key}` } }
    }[provider];
    if (!config) throw new Error("Unsupported provider.");
    const response = await fetchWithTimeout(config.url, { headers: config.headers }, fetchImpl, timeoutMs);
    if (!response.ok) {
      throw new ProviderRequestError(
        await readProviderError(response, `Connection test failed (HTTP ${response.status}).`),
        response.status,
        core.isRetryableStatus(response.status)
      );
    }
    return true;
  }

  function getCaptureResults(session, requestId, now = Date.now()) {
    if (!session || session.requestId !== requestId || now > session.expiresAt) return [];
    return Array.isArray(session.urls) ? [...session.urls] : [];
  }

  return {
    GeminiRequestError,
    ProviderRequestError,
    arrayBufferToBase64,
    fetchExternalAudio,
    getCaptureResults,
    requestTranscript,
    testApiKey,
    testProviderApiKey,
    transcribeWithElevenLabs,
    transcribeWithGemini,
    transcribeWithGroq,
    transcribeWithHuggingFace,
    transcribeWithOpenAiCompatible,
    transcribeWithXai,
    transcribeAudio
  };
});
