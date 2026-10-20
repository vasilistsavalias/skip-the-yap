const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/shared/core.js");

test("allows only HTTPS media hosts used by supported chat sites", () => {
  assert.equal(core.isAllowedMediaUrl("https://video.xx.fbcdn.net/audio.m4a"), true);
  assert.equal(core.isAllowedMediaUrl("https://facebook.com.evil.example/audio.m4a"), false);
  assert.equal(core.isAllowedMediaUrl("http://fbcdn.net/audio.m4a"), false);
  assert.equal(core.isAllowedMediaUrl("https://127.0.0.1/audio.m4a"), false);
  assert.equal(core.isMediaCdnUrl("https://video.xx.fbcdn.net/opaque-id"), true);
  assert.equal(core.isMediaCdnUrl("https://www.messenger.com/api/graphql"), false);
});

test("rejects empty, unsupported, and oversized audio", () => {
  assert.throws(() => core.validateAudioPayload("", "audio/mp4"), /did not contain audio/);
  assert.throws(() => core.validateAudioPayload("YWJj", "text/html"), /Unsupported/);
  const tooLarge = "A".repeat(Math.ceil((core.MAX_AUDIO_BYTES + 1) * 4 / 3));
  assert.throws(() => core.validateAudioPayload(tooLarge, "audio/mp4"), /too large/);
});

test("labels audio-only MP4 voice notes as audio for Gemini", () => {
  assert.equal(core.normalizeMimeType("video/mp4; codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(core.validateAudioPayload("YWJj", "video/mp4").mimeType, "audio/mp4");
});

test("canonicalizes supported aliases and corrects recognizable container metadata", () => {
  const wav = Buffer.from("RIFF0000WAVEfmt ").toString("base64");
  const mp4 = Buffer.from("0000ftypisom").toString("base64");
  assert.equal(core.normalizeMimeType("audio/x-wav"), "audio/wav");
  assert.equal(core.normalizeMimeType("audio/m4a"), "audio/mp4");
  assert.equal(core.validateAudioPayload(wav, "audio/mp4").mimeType, "audio/wav");
  assert.equal(core.validateAudioPayload(mp4, "audio/mpeg").mimeType, "audio/mp4");
  assert.throws(() => core.validateAudioPayload(Buffer.from("<!doctype html>").toString("base64"), "audio/mp4"), /was not audio/);
  assert.throws(() => core.validateAudioPayload("YWJj", "audio/x-unknown"), /Unsupported/);
});

test("model routing accepts only supported configured models", () => {
  assert.deepEqual(core.buildModelOrder("auto"), [...core.MODEL_CASCADE]);
  assert.equal(core.buildModelOrder("gemini-3.5-transcribe")[0], "gemini-3.8-flash");
  assert.deepEqual(core.buildModelOrder("attacker-controlled-model"), [...core.MODEL_CASCADE]);
  assert.deepEqual(core.MODEL_CASCADE, [
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
  ]);
});

test("provider routing accepts only supported providers", () => {
  assert.deepEqual(core.PROVIDERS, ["gemini", "groq", "huggingface", "openai", "xai", "elevenlabs", "openrouter"]);
  assert.equal(core.normalizeProviderMode("auto"), "auto");
  assert.equal(core.normalizeProviderMode("groq"), "groq");
  assert.equal(core.normalizeProviderMode("attacker-controlled-provider"), "gemini");
  assert.deepEqual(core.resolveProviderOrder({ primaryProvider: "openai", fallbackEnabled: true, fallbackProviders: ["groq", "openai", "groq"] }), ["openai", "groq"]);
  assert.deepEqual(core.buildProviderModelOrder("openai", ["whisper-1", "not-a-model"]), ["whisper-1"]);
});

test("custom prompts are bounded", () => {
  assert.equal(core.getPrompt({ transcribeMode: "clean" }), core.PROMPTS.clean);
  assert.equal(core.getPrompt({ customPrompt: "x".repeat(5000) }).length, 4000);
});
