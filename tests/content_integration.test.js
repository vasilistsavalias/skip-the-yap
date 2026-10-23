const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const extension = path.resolve(__dirname, "..", "src");

function captureTrustedTrigger(dom) {
  let trigger;
  let clickListener;
  const originalAddEventListener = dom.window.EventTarget.prototype.addEventListener;
  dom.window.EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
    if (type === "click" && this.classList?.contains("vt-transcribe-trigger")) {
      trigger = this;
      clickListener = listener;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  return () => {
    assert.ok(trigger);
    assert.ok(clickListener);
    clickListener.call(trigger, {
      isTrusted: true,
      preventDefault() {},
      stopPropagation() {}
    });
  };
}

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Condition was not met within ${timeoutMs} ms.`);
}

test("a trusted Messenger trigger captures the selected voice note and starts transcription", async () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice"><button id="play" aria-label="Play voice clip">Play</button><span>0:18</span></div>
      <div role="textbox" contenteditable="true" aria-label="Message"></div>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.messenger.com/t/example"
  });
  const actions = [];
  const triggerTrustedClick = captureTrustedTrigger(dom);
  const fetchedAudio = new dom.window.Blob(["small audio"], { type: "audio/mp4" });
  dom.window.fetch = async () => ({
    ok: true,
    headers: { get: (name) => name === "content-type" ? "audio/mp4" : null },
    clone: () => ({ blob: async () => fetchedAudio })
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async (request) => {
        actions.push(request.action);
        if (request.action === "BEGIN_AUDIO_CAPTURE") return { success: true };
        if (request.action === "GET_AUDIO_CAPTURE") return { success: false, urls: [] };
        if (request.action === "FETCH_EXTERNAL_AUDIO") {
          return { success: true, base64Data: "c21hbGwgYXVkaW8=", mimeType: "audio/mp4" };
        }
        if (request.action === "TRANSCRIBE_AUDIO") {
          return { success: true, text: "captured", modelUsed: "gemini-3.8-flash" };
        }
        return { success: true };
      }
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };

  dom.window.eval(fs.readFileSync(path.join(extension, "content", "page-bridge.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "shared", "core.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "dom.js"), "utf8"));
  dom.window.document.getElementById("voice").getBoundingClientRect = () => ({
    left: 32,
    right: 317,
    top: 65,
    bottom: 162,
    width: 285,
    height: 97
  });
  dom.window.document.getElementById("play").addEventListener("click", () => {
    dom.window.fetch("https://video.xx.fbcdn.net/opaque-selected-audio");
  });
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "content-script.js"), "utf8"));
  await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));

  const trigger = dom.window.document.querySelector(".vt-transcribe-trigger");
  assert.equal(trigger.querySelector(".vt-trigger-icon")?.tagName.toLowerCase(), "svg");
  assert.equal(trigger.style.left, "325px");
  assert.equal(trigger.style.top, "113.5px");
  trigger.click();
  assert.deepEqual(actions, []);
  triggerTrustedClick();
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.deepEqual(actions.filter((action) => action !== "END_AUDIO_CAPTURE"), [
    "BEGIN_AUDIO_CAPTURE",
    "GET_AUDIO_CAPTURE",
    "TRANSCRIBE_AUDIO",
    "GET_CONTENT_PREFERENCES"
  ]);
  assert.equal(dom.window.document.querySelector(".vt-transcript-card"), null);
  assert.equal(dom.window.document.querySelector('[role="textbox"]').textContent, "captured");
  assert.match(dom.window.document.querySelector(".vt-toast").textContent, /inserted into chat/i);
  dom.window.close();
});

test("a trusted Instagram trigger waits for a lazy-loaded voice-note source", async () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice"><button id="play"><svg></svg></button><span>0:05</span></div>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.instagram.com/direct/t/example/"
  });
  const actions = [];
  let copiedTranscript = "";
  const triggerTrustedClick = captureTrustedTrigger(dom);
  const fetchedAudio = new dom.window.Blob(["instagram audio"], { type: "audio/mp4" });
  dom.window.fetch = async () => ({
    ok: true,
    headers: { get: (name) => name === "content-type" ? "audio/mp4" : null },
    clone: () => ({ blob: async () => fetchedAudio })
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async (request) => {
        actions.push(request.action);
        if (request.action === "BEGIN_AUDIO_CAPTURE") return { success: true };
        if (request.action === "GET_AUDIO_CAPTURE") return { success: false, urls: [] };
        if (request.action === "TRANSCRIBE_AUDIO") {
          return { success: true, text: "instagram transcript", modelUsed: "gemini-2.5-flash" };
        }
        return { success: true };
      }
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: { writeText: async (text) => { copiedTranscript = text; } }
  });

  dom.window.eval(fs.readFileSync(path.join(extension, "content", "page-bridge.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "shared", "core.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "dom.js"), "utf8"));
  dom.window.document.getElementById("play").addEventListener("click", () => {
    setTimeout(() => dom.window.fetch("https://scontent.cdninstagram.com/selected-audio"), 2100);
  });
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "content-script.js"), "utf8"));

  triggerTrustedClick();
  await waitFor(() => copiedTranscript === "instagram transcript");

  assert.equal(actions.includes("TRANSCRIBE_AUDIO"), true);
  assert.equal(dom.window.document.querySelector(".vt-transcript-card"), null);
  assert.equal(copiedTranscript, "instagram transcript");
  assert.match(dom.window.document.querySelector(".vt-toast").textContent, /copied instead/i);
  dom.window.close();
});

test("page-owned blob transcription does not require content-script storage access", async () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice"><audio src="blob:https://www.messenger.com/selected-audio"></audio><button id="play" aria-label="Play voice clip">Play</button><span>0:08</span></div>
      <div role="textbox" contenteditable="true" aria-label="Message"></div>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.messenger.com/t/example"
  });
  const actions = [];
  const triggerTrustedClick = captureTrustedTrigger(dom);
  dom.window.HTMLMediaElement.prototype.play = async function play() {};
  dom.window.HTMLMediaElement.prototype.pause = function pause() {};
  dom.window.fetch = async () => ({
    ok: true,
    blob: async () => new dom.window.Blob(["small audio"], { type: "audio/webm" })
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async (request) => {
        actions.push(request.action);
        if (request.action === "BEGIN_AUDIO_CAPTURE") return { success: true };
        if (request.action === "GET_AUDIO_CAPTURE") return { success: false, urls: [] };
        if (request.action === "TRANSCRIBE_AUDIO") {
          return { success: true, text: "captured from blob", modelUsed: "gemini-3.8-flash" };
        }
        return { success: true };
      }
    },
    storage: {
      local: {
        get: async () => { throw new dom.window.DOMException("Access to storage is not allowed from this context."); }
      }
    }
  };

  dom.window.eval(fs.readFileSync(path.join(extension, "content", "page-bridge.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "shared", "core.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "dom.js"), "utf8"));
  const audio = dom.window.document.querySelector("audio");
  dom.window.document.getElementById("play").addEventListener("click", () => audio.play());
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "content-script.js"), "utf8"));

  triggerTrustedClick();
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(actions.includes("FETCH_EXTERNAL_AUDIO"), false);
  assert.equal(actions.includes("TRANSCRIBE_AUDIO"), true);
  assert.equal(dom.window.document.querySelector(".vt-transcript-card"), null);
  assert.equal(dom.window.document.querySelector('[role="textbox"]').textContent, "captured from blob");
  assert.match(dom.window.document.querySelector(".vt-toast").textContent, /inserted into chat/i);
  dom.window.close();
});

test("Cancel stops a selected transcription before it reaches Gemini", async () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice"><button id="play" aria-label="Play voice clip">Play</button><span>0:12</span></div>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.messenger.com/t/example"
  });
  const actions = [];
  const triggerTrustedClick = captureTrustedTrigger(dom);
  const fetchedAudio = new dom.window.Blob(["small audio"], { type: "audio/mp4" });
  dom.window.fetch = async () => ({
    ok: true,
    headers: { get: (name) => name === "content-type" ? "audio/mp4" : null },
    clone: () => ({ blob: async () => fetchedAudio })
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async (request) => {
        actions.push(request.action);
        if (request.action === "BEGIN_AUDIO_CAPTURE") {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { success: true };
        }
        if (request.action === "GET_AUDIO_CAPTURE") return { success: false, urls: [] };
        return { success: true };
      }
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };

  dom.window.eval(fs.readFileSync(path.join(extension, "content", "page-bridge.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "shared", "core.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "dom.js"), "utf8"));
  dom.window.document.getElementById("play").addEventListener("click", () => {
    dom.window.fetch("https://video.xx.fbcdn.net/selected-audio");
  });
  dom.window.eval(fs.readFileSync(path.join(extension, "content", "content-script.js"), "utf8"));

  triggerTrustedClick();
  assert.equal(dom.window.document.querySelector(".vt-trigger-spinner") !== null, true);
  triggerTrustedClick();
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(actions.includes("CANCEL_TRANSCRIPTION"), true);
  assert.equal(actions.includes("TRANSCRIBE_AUDIO"), false);
  assert.equal(dom.window.document.querySelector(".vt-transcript-card"), null);
  assert.equal(dom.window.document.querySelector(".vt-trigger-icon")?.tagName.toLowerCase(), "svg");
  assert.match(dom.window.document.querySelector(".vt-toast").textContent, /cancelled/);
  dom.window.close();
});
