const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const extension = path.resolve(__dirname, "..", "src");

async function loadPopup(initial = {}) {
  const html = fs.readFileSync(path.join(extension, "popup", "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://extension.test/popup.html" });
  const stored = { hasSeenTour: true, ...initial };
  const requestedOrigins = [];
  let connectionResult = { success: true };
  dom.window.chrome = {
    runtime: {
      getManifest: () => ({ version: "9.8.7" }),
      sendMessage: async () => connectionResult
    },
    permissions: {
      request: async ({ origins }) => {
        requestedOrigins.push(...origins);
        return true;
      }
    },
    storage: { local: {
      get: (defaults, callback) => callback({ ...defaults, ...stored }),
      set: async (values, callback) => { Object.assign(stored, values); callback?.(); },
      clear: async () => { for (const key of Object.keys(stored)) delete stored[key]; }
    } }
  };
  dom.window.eval(fs.readFileSync(path.join(extension, "shared", "core.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "popup", "popup.js"), "utf8"));
  await new Promise((resolve) => setImmediate(resolve));
  return { dom, stored, requestedOrigins, setConnectionResult: (value) => { connectionResult = value; } };
}

test("popup shows one dynamic provider editor and provider-specific guide", async () => {
  const { dom, stored, requestedOrigins, setConnectionResult } = await loadPopup();
  const document = dom.window.document;
  const keyInput = document.getElementById("providerApiKey");

  assert.equal(document.querySelectorAll(".provider-key").length, 1);
  assert.equal(document.getElementById("autoInsertChat"), null);
  assert.equal(document.getElementById("autoCopyClipboard").checked, true);
  assert.match(document.querySelector(".prefs-section").textContent, /enabled by default/i);
  assert.equal(document.getElementById("providerKeyLabel").textContent, "Gemini API key");
  assert.equal(document.getElementById("statusIndicator"), null);
  assert.equal(document.getElementById("providerNote"), null);
  assert.equal(document.querySelector(".privacy-note"), null);
  assert.equal(document.getElementById("apiStatusPill").hidden, true);
  keyInput.value = "test-only-key";
  keyInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stored.geminiApiKey, "test-only-key");

  const provider = document.getElementById("primaryProvider");
  provider.value = "openai";
  provider.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stored.primaryProvider, "openai");
  assert.equal(document.getElementById("providerKeyLabel").textContent, "OpenAI API key");
  assert.match(document.getElementById("toggleGuideBtn").textContent, /OpenAI/);
  assert.equal(document.getElementById("guideLink").href, "https://platform.openai.com/api-keys");

  setConnectionResult({ success: false, error: "Temporary provider error with a complete readable message." });
  keyInput.value = "test-only-openai-key";
  keyInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  document.getElementById("testApiKeyBtn").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requestedOrigins, ["https://api.openai.com/*"]);
  assert.equal(document.getElementById("apiStatusPill").hidden, false);
  assert.match(document.getElementById("apiStatusPill").textContent, /complete readable message/);
});

test("advanced fallback adds providers and exposes their model order", async () => {
  const { dom, stored } = await loadPopup({ geminiApiKey: "test-only-key" });
  const document = dom.window.document;
  const toggle = document.getElementById("fallbackEnabled");
  toggle.checked = true;
  toggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stored.fallbackEnabled, true);
  assert.equal(document.getElementById("fallbackContent").inert, false);

  const selector = document.getElementById("fallbackProviderSelect");
  selector.value = "groq";
  document.getElementById("addFallbackBtn").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Array.from(stored.fallbackProviders), ["groq"]);
  assert.equal(document.querySelectorAll(".route-card").length, 2);
  assert.match(document.querySelector('[data-provider="groq"] .model-details').textContent, /whisper-large-v3-turbo/);

  const groqKey = document.querySelector('[data-provider="groq"] input[data-provider-key]');
  groqKey.value = "test-only-groq-key";
  groqKey.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stored.groqApiKey, "test-only-groq-key");
});

test("popup migrates old Auto routing and clears local data deliberately", async () => {
  const { dom, stored } = await loadPopup({ providerMode: "auto", geminiApiKey: "test-only-key", groqApiKey: "test-only-groq-key" });
  const document = dom.window.document;
  assert.equal(stored.primaryProvider, "gemini");
  assert.deepEqual(Array.from(stored.fallbackProviders), ["groq"]);
  assert.equal(document.getElementById("fallbackEnabled").checked, true);
  assert.match(document.querySelector(".dev-title").textContent, /Advanced settings/);
  assert.equal(document.getElementById("clearDataBtn").previousElementSibling?.classList.contains("advanced-section"), true);

  document.getElementById("clearDataBtn").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stored.geminiApiKey, "test-only-key");
  document.getElementById("clearDataBtn").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stored, {});
  assert.equal(document.getElementById("providerApiKey").value, "");
});

test("popup tour remains keyboard dismissible", async () => {
  const { dom } = await loadPopup();
  const document = dom.window.document;
  document.getElementById("startTourBtn").click();
  assert.equal(document.getElementById("tourModal").hidden, false);
  assert.equal(document.querySelectorAll(".tour-slide").length, 4);
  assert.match(document.querySelector('[data-slide="3"]').textContent, /local extension storage/i);
  assert.match(document.querySelector('[data-slide="3"]').textContent, /no backend/i);
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(document.getElementById("tourModal").hidden, true);
});

test("popup shows the installed version and keyboard-dismissible release notes", async () => {
  const { dom } = await loadPopup();
  const document = dom.window.document;

  assert.equal(document.getElementById("versionTag").textContent, "v9.8.7");
  document.getElementById("releaseNotesBtn").click();
  assert.equal(document.getElementById("releaseNotesModal").hidden, false);
  assert.equal(document.getElementById("releaseNotesVersion").textContent, "v9.8.7");

  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(document.getElementById("releaseNotesModal").hidden, true);
  assert.equal(document.activeElement.id, "releaseNotesBtn");
});
