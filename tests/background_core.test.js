const test = require("node:test");
const assert = require("node:assert/strict");
const backgroundCore = require("../src/background/transcription.js");
const core = require("../src/shared/core.js");

const audio = Buffer.from("small audio fixture").toString("base64");
const settings = { geminiApiKey: "test-only-key", preferredModel: "auto", transcribeMode: "verbatim" };

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("does not send a transcription without a user API key", async () => {
  await assert.rejects(
    backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings: {} }, { fetchImpl: () => assert.fail("fetch must not run") }),
    /Add your Gemini API key/
  );
});

test("sends the API key in a header and returns transcript text", async () => {
  let requestedUrl;
  let requestedHeaders;
  const fetchImpl = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "hello" }] } }] });
  };
  const result = await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl });
  assert.equal(result.text, "hello");
  assert.equal(requestedHeaders["x-goog-api-key"], settings.geminiApiKey);
  assert.equal(requestedUrl.includes(settings.geminiApiKey), false);
});

test("sends audio-only MP4 voice notes to Gemini with an audio MIME type", async () => {
  let requestedBody;
  const fetchImpl = async (url, options) => {
    requestedBody = JSON.parse(options.body);
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "hello" }] } }] });
  };

  await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "video/mp4", settings }, { fetchImpl });

  assert.equal(requestedBody.contents[0].parts[0].inline_data.mime_type, "audio/mp4");
});

test("falls back to the next model on retryable service errors", async () => {
  const requestedModels = [];
  const fetchImpl = async (url) => {
    requestedModels.push(new URL(url).pathname.split("/").pop().split(":")[0]);
    if (requestedModels.length === 1) return jsonResponse(503, { error: { message: "busy" } });
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "fallback worked" }] } }] });
  };
  const result = await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl });
  assert.equal(result.text, "fallback worked");
  assert.deepEqual(requestedModels, core.MODEL_CASCADE.slice(0, 2));
});

test("retries the complete model cascade once before reporting temporary exhaustion", async () => {
  const requestedModels = [];
  const fetchImpl = async (url) => {
    requestedModels.push(new URL(url).pathname.split("/").pop().split(":")[0]);
    return jsonResponse(503, { error: { message: "high demand" } });
  };

  await assert.rejects(
    backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl }),
    new RegExp(`No Gemini model returned a transcript after ${core.MODEL_CASCADE.length * 2} attempts`)
  );
  assert.deepEqual(requestedModels, [...core.MODEL_CASCADE, ...core.MODEL_CASCADE]);
});

test("reports the deadline accurately when slow failures prevent a complete cascade", async () => {
  let clock = 0;
  const fetchImpl = async () => {
    clock += 10001;
    return jsonResponse(503, { error: { message: "busy" } });
  };

  await assert.rejects(
    backgroundCore.transcribeAudio(
      { base64Data: audio, mimeType: "audio/wav", settings },
      { fetchImpl, now: () => clock }
    ),
    /did not respond within 45 seconds after 5 model attempts/
  );
});

test("falls back after a network failure", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network unavailable");
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "network fallback worked" }] } }] });
  };

  const result = await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl });
  assert.equal(result.text, "network fallback worked");
  assert.equal(calls, 2);
});

test("turns a raw audio-download abort into an actionable error", async () => {
  await assert.rejects(
    backgroundCore.fetchExternalAudio(
      "https://video.xx.fbcdn.net/selected-audio",
      async () => { throw new DOMException("signal is aborted without reason", "AbortError"); }
    ),
    /Timed out while downloading this voice note from the chat service/
  );
});

test("external audio uses its container signature when CDN metadata is generic", async () => {
  const wavBytes = Buffer.from("RIFF0000WAVEfmt ");
  const result = await backgroundCore.fetchExternalAudio(
    "https://video.xx.fbcdn.net/selected-audio",
    async () => new Response(wavBytes, { status: 200, headers: { "Content-Type": "application/octet-stream" } })
  );
  assert.equal(result.mimeType, "audio/wav");

  await assert.rejects(
    backgroundCore.fetchExternalAudio(
      "https://video.xx.fbcdn.net/not-audio",
      async () => new Response("<!doctype html><title>error</title>", { status: 200, headers: { "Content-Type": "audio/mp4" } })
    ),
    /was not audio/
  );
});

test("external audio rejects a redirect outside the approved media hosts", async () => {
  const wavBytes = Buffer.from("RIFF0000WAVEfmt ");
  await assert.rejects(
    backgroundCore.fetchExternalAudio(
      "https://video.xx.fbcdn.net/selected-audio",
      async () => {
        const response = new Response(wavBytes, { status: 200, headers: { "Content-Type": "audio/wav" } });
        Object.defineProperty(response, "url", { value: "https://example.test/redirected-audio" });
        return response;
      }
    ),
    /redirected to an untrusted host/
  );
});

test("turns a Gemini timeout into a retryable model error", async () => {
  const fetchImpl = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")), { once: true });
  });

  await assert.rejects(
    backgroundCore.requestTranscript({
      model: "gemini-test",
      apiKey: settings.geminiApiKey,
      base64Data: audio,
      mimeType: "audio/wav",
      prompt: "Transcribe.",
      fetchImpl,
      timeoutMs: 1
    }),
    (error) => error.message === "gemini-test timed out while transcribing." && error.status === 408
  );
});

test("falls back to the next model after an empty successful response", async () => {
  const requestedModels = [];
  const fetchImpl = async (url) => {
    requestedModels.push(new URL(url).pathname.split("/").pop().split(":")[0]);
    if (requestedModels.length === 1) {
      return jsonResponse(200, { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
    }
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "second model transcript" }] } }] });
  };

  const result = await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl });

  assert.equal(result.text, "second model transcript");
  assert.deepEqual(requestedModels, core.MODEL_CASCADE.slice(0, 2));
});

test("reports a blocked audio response without trying unrelated models", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { promptFeedback: { blockReason: "SAFETY" } });
  };

  await assert.rejects(
    backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl }),
    /blocked this audio request \(SAFETY\)/
  );
  assert.equal(calls, 1);
});

test("stops immediately on authentication failures", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(401, { error: { message: "invalid key" } });
  };
  await assert.rejects(
    backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, { fetchImpl }),
    /invalid key/
  );
  assert.equal(calls, 1);
});

test("Groq falls back between Whisper models and returns the provider used", async () => {
  const requestedModels = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(options.headers.Authorization, "Bearer test-only-groq-key");
    requestedModels.push(options.body.get("model"));
    if (requestedModels.length === 1) return jsonResponse(503, { error: { message: "busy" } });
    return jsonResponse(200, { text: "groq transcript" });
  };

  const result = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { providerMode: "groq", groqApiKey: "test-only-groq-key", transcribeMode: "verbatim" }
  }, { fetchImpl });

  assert.equal(result.text, "groq transcript");
  assert.equal(result.providerUsed, "groq");
  assert.equal(result.modelUsed, "whisper-large-v3");
  assert.deepEqual(requestedModels, ["whisper-large-v3-turbo", "whisper-large-v3"]);
});

test("Groq uses its text model for Cleaned mode", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    if (url.endsWith("/audio/transcriptions")) return jsonResponse(200, { text: "um hello hello" });
    return jsonResponse(200, { choices: [{ message: { content: "Hello." } }] });
  };

  const result = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { providerMode: "groq", groqApiKey: "test-only-groq-key", transcribeMode: "clean" }
  }, { fetchImpl });

  assert.equal(result.text, "Hello.");
  assert.deepEqual(requestedUrls, [
    "https://api.groq.com/openai/v1/audio/transcriptions",
    "https://api.groq.com/openai/v1/chat/completions"
  ]);
});

test("ElevenLabs transcribes Verbatim mode with Scribe", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(options.headers["xi-api-key"], "test-only-eleven-key");
    assert.equal(options.body.get("model_id"), "scribe_v2");
    return jsonResponse(200, { text: "scribe transcript" });
  };

  const result = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { providerMode: "elevenlabs", elevenLabsApiKey: "test-only-eleven-key", transcribeMode: "verbatim" }
  }, { fetchImpl });

  assert.equal(result.text, "scribe transcript");
  assert.equal(result.providerUsed, "elevenlabs");
  assert.equal(result.modelUsed, "scribe-v2");
});

test("ElevenLabs reports that processed modes need Gemini or Groq", async () => {
  await assert.rejects(backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { providerMode: "elevenlabs", elevenLabsApiKey: "test-only-eleven-key", transcribeMode: "summary" }
  }, { fetchImpl: () => assert.fail("ElevenLabs must not receive unsupported processed modes") }), /does not support Cleaned/);
});

test("Auto falls through a busy Gemini cascade to Groq", async () => {
  const requestedHosts = [];
  const fetchImpl = async (url) => {
    const host = new URL(url).hostname;
    requestedHosts.push(host);
    if (host === "generativelanguage.googleapis.com") return jsonResponse(503, { error: { message: "busy" } });
    return jsonResponse(200, { text: "cross-provider fallback" });
  };

  const result = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: {
      providerMode: "auto",
      geminiApiKey: settings.geminiApiKey,
      groqApiKey: "test-only-groq-key",
      transcribeMode: "verbatim"
    }
  }, { fetchImpl });

  assert.equal(result.text, "cross-provider fallback");
  assert.equal(result.providerUsed, "groq");
  assert.equal(requestedHosts.includes("generativelanguage.googleapis.com"), true);
  assert.equal(requestedHosts.at(-1), "api.groq.com");
});

test("Auto does not bypass a terminal Gemini audio rejection", async () => {
  let groqCalls = 0;
  const fetchImpl = async (url) => {
    if (new URL(url).hostname === "api.groq.com") groqCalls += 1;
    return jsonResponse(200, { promptFeedback: { blockReason: "SAFETY" } });
  };

  await assert.rejects(backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: {
      providerMode: "auto",
      geminiApiKey: settings.geminiApiKey,
      groqApiKey: "test-only-groq-key",
      transcribeMode: "verbatim"
    }
  }, { fetchImpl }), /blocked this audio request/);
  assert.equal(groqCalls, 0);
});

test("provider key tests use provider-specific authentication", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, headers: options.headers });
    return jsonResponse(200, {});
  };

  await backgroundCore.testProviderApiKey({ provider: "groq", apiKey: "groq-key", fetchImpl });
  await backgroundCore.testProviderApiKey({ provider: "elevenlabs", apiKey: "eleven-key", fetchImpl });

  assert.equal(requests[0].url, "https://api.groq.com/openai/v1/models");
  assert.equal(requests[0].headers.Authorization, "Bearer groq-key");
  assert.equal(requests[1].url, "https://api.elevenlabs.io/v1/user/subscription");
  assert.equal(requests[1].headers["xi-api-key"], "eleven-key");
});

test("OpenAI-compatible providers share normalized multipart audio with separate model lists", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization, model: options.body.get("model"), type: options.body.get("file").type });
    return jsonResponse(200, { text: "compatible transcript" });
  };

  const openai = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "video/mp4",
    settings: { primaryProvider: "openai", openaiApiKey: "openai-key", transcribeMode: "verbatim", providerModels: { openai: ["whisper-1"] } }
  }, { fetchImpl });
  const openrouter = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { primaryProvider: "openrouter", openrouterApiKey: "openrouter-key", transcribeMode: "verbatim", providerModels: { openrouter: ["openai/whisper-1"] } }
  }, { fetchImpl });

  assert.equal(openai.providerUsed, "openai");
  assert.equal(openrouter.providerUsed, "openrouter");
  assert.deepEqual(requests, [
    { url: "https://api.openai.com/v1/audio/transcriptions", authorization: "Bearer openai-key", model: "whisper-1", type: "audio/mp4" },
    { url: "https://openrouter.ai/api/v1/audio/transcriptions", authorization: "Bearer openrouter-key", model: "openai/whisper-1", type: "audio/wav" }
  ]);
});

test("xAI and Hugging Face use their required audio request shapes", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(200, { text: "provider transcript" });
  };

  await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { primaryProvider: "xai", xaiApiKey: "xai-key", transcribeMode: "verbatim" }
  }, { fetchImpl });
  await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: { primaryProvider: "huggingface", huggingfaceApiKey: "hf-key", transcribeMode: "verbatim", providerModels: { huggingface: ["openai/whisper-large-v3"] } }
  }, { fetchImpl });

  assert.equal(requests[0].url, "https://api.x.ai/v1/stt");
  assert.equal(requests[0].options.body.get("filler_words"), "true");
  assert.deepEqual([...requests[0].options.body.keys()], ["filler_words", "file"]);
  assert.equal(requests[1].url, "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3");
  assert.equal(requests[1].options.headers["Content-Type"], "audio/wav");
  assert.equal(requests[1].options.body.type, "audio/wav");
});

test("model fallback decodes the captured audio only once", async () => {
  const originalAtob = globalThis.atob;
  let decodes = 0;
  globalThis.atob = (value) => {
    decodes += 1;
    return originalAtob(value);
  };
  try {
    let calls = 0;
    await backgroundCore.transcribeAudio({
      base64Data: audio,
      mimeType: "audio/wav",
      settings: { primaryProvider: "groq", groqApiKey: "groq-key", transcribeMode: "verbatim" }
    }, { fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(503, { error: { message: "busy" } }) : jsonResponse(200, { text: "done" });
    } });
    assert.equal(calls, 2);
    assert.equal(decodes, 2, "one short signature read and one full Blob decode");
  } finally {
    globalThis.atob = originalAtob;
  }
});

test("Gemini keeps the captured audio in base64 without allocating an upload Blob", async () => {
  const originalAtob = globalThis.atob;
  let decodes = 0;
  globalThis.atob = (value) => {
    decodes += 1;
    return originalAtob(value);
  };
  try {
    await backgroundCore.transcribeAudio({ base64Data: audio, mimeType: "audio/wav", settings }, {
      fetchImpl: async () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: "done" }] } }] })
    });
    assert.equal(decodes, 1, "only the short signature prefix should be decoded");
  } finally {
    globalThis.atob = originalAtob;
  }
});

test("new routing follows the configured provider order", async () => {
  const hosts = [];
  const fetchImpl = async (url) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    if (host === "generativelanguage.googleapis.com") return jsonResponse(503, { error: { message: "busy" } });
    return jsonResponse(200, { text: "fallback transcript" });
  };
  const result = await backgroundCore.transcribeAudio({
    base64Data: audio,
    mimeType: "audio/wav",
    settings: {
      primaryProvider: "gemini", fallbackEnabled: true, fallbackProviders: ["openai"],
      geminiApiKey: "gemini-key", openaiApiKey: "openai-key", transcribeMode: "verbatim",
      providerModels: { gemini: [core.MODEL_CASCADE[0]], openai: ["whisper-1"] }
    }
  }, { fetchImpl });

  assert.equal(result.providerUsed, "openai");
  assert.deepEqual(hosts, ["generativelanguage.googleapis.com", "api.openai.com"]);
});

test("capture results require the matching request and a live session", () => {
  const session = { requestId: "selected-note", expiresAt: 2000, urls: ["https://fbcdn.net/selected.m4a"] };
  assert.deepEqual(backgroundCore.getCaptureResults(session, "selected-note", 1000), session.urls);
  assert.deepEqual(backgroundCore.getCaptureResults(session, "other-note", 1000), []);
  assert.deepEqual(backgroundCore.getCaptureResults(session, "selected-note", 3000), []);
});

test("API-key test uses text only and keeps the key out of the URL", async () => {
  let body;
  let url;
  await backgroundCore.testApiKey({
    apiKey: settings.geminiApiKey,
    models: ["gemini-3.8-flash"],
    fetchImpl: async (requestedUrl, options) => {
      url = requestedUrl;
      body = JSON.parse(options.body);
      assert.equal(options.headers["x-goog-api-key"], settings.geminiApiKey);
      return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    }
  });
  assert.equal(url.includes(settings.geminiApiKey), false);
  assert.equal(body.contents[0].parts.some((part) => "inline_data" in part), false);
});

test("API-key test falls back after a model timeout without exposing the raw abort", async () => {
  const requestedModels = [];
  const fetchImpl = async (url, options) => {
    requestedModels.push(new URL(url).pathname.split("/").pop().split(":")[0]);
    if (requestedModels.length === 1) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")), { once: true });
      });
    }
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "OK" }] } }] });
  };

  await backgroundCore.testApiKey({
    apiKey: settings.geminiApiKey,
    models: ["slow-model", "working-model"],
    fetchImpl,
    timeoutMs: 1
  });

  assert.deepEqual(requestedModels, ["slow-model", "working-model"]);
});

test("API-key test keeps authentication failures terminal", async () => {
  let calls = 0;
  await assert.rejects(
    backgroundCore.testApiKey({
      apiKey: settings.geminiApiKey,
      models: ["first-model", "second-model"],
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(401, { error: { message: "invalid key" } });
      }
    }),
    /invalid key/
  );
  assert.equal(calls, 1);
});
