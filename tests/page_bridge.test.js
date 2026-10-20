const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "content", "page-bridge.js"), "utf8");

test("page bridge reports and mutes media only during the selected capture window", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only", url: "https://www.messenger.com/t/example" });
  dom.window.HTMLMediaElement.prototype.play = async function play() {};
  let pauseCount = 0;
  dom.window.HTMLMediaElement.prototype.pause = function pause() { pauseCount += 1; };
  dom.window.fetch = async () => ({ ok: true });
  dom.window.eval(bridgeSource);

  const audio = dom.window.document.createElement("audio");
  audio.src = "https://video.xx.fbcdn.net/selected-audio";
  dom.window.document.body.appendChild(audio);
  const found = [];
  dom.window.addEventListener("voice-transcriber:source-found", (event) => found.push(event.detail));

  await audio.play();
  assert.equal(found.length, 0);
  assert.equal(audio.muted, false);

  dom.window.dispatchEvent(new dom.window.CustomEvent("voice-transcriber:capture-start", {
    detail: { requestId: "selected-note" }
  }));
  assert.equal(audio.muted, true);
  await audio.play();
  await audio.play();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(found.length, 2);
  assert.equal(found[0].requestId, "selected-note");
  assert.equal(found[0].kind, "media");
  assert.equal(audio.muted, true);
  assert.equal(pauseCount, 2);

  dom.window.dispatchEvent(new dom.window.CustomEvent("voice-transcriber:capture-stop", {
    detail: { requestId: "selected-note" }
  }));
  assert.equal(audio.muted, false);
  dom.window.close();
});

test("page bridge ignores partial MP4 responses", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only", url: "https://www.instagram.com/direct/t/example/" });
  const blob = new dom.window.Blob(["partial audio chunk"], { type: "video/mp4" });
  dom.window.fetch = async () => ({
    ok: true,
    status: 206,
    headers: { get: (name) => name === "content-type" ? "video/mp4" : name === "content-range" ? "bytes 0-99/1000" : null },
    clone: () => ({ blob: async () => blob })
  });
  dom.window.eval(bridgeSource);
  let audioDataCount = 0;
  dom.window.addEventListener("voice-transcriber:audio-data-found", () => { audioDataCount += 1; });

  dom.window.dispatchEvent(new dom.window.CustomEvent("voice-transcriber:capture-start", {
    detail: { requestId: "selected-partial-fetch" }
  }));
  await dom.window.fetch("https://scontent.cdninstagram.com/selected-audio");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(audioDataCount, 0);
  dom.window.close();
});

test("page bridge reads a selected page-owned blob during capture", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only", url: "https://www.messenger.com/t/example" });
  dom.window.HTMLMediaElement.prototype.play = async function play() {};
  dom.window.HTMLMediaElement.prototype.pause = function pause() {};
  dom.window.fetch = async () => ({
    ok: true,
    blob: async () => new dom.window.Blob(["small audio"], { type: "audio/webm" })
  });
  dom.window.eval(bridgeSource);

  const audio = dom.window.document.createElement("audio");
  audio.src = "blob:https://www.messenger.com/selected-audio";
  dom.window.document.body.appendChild(audio);
  const audioData = new Promise((resolve) => {
    dom.window.addEventListener("voice-transcriber:audio-data-found", (event) => resolve(event.detail), { once: true });
  });

  dom.window.dispatchEvent(new dom.window.CustomEvent("voice-transcriber:capture-start", {
    detail: { requestId: "selected-blob" }
  }));
  await audio.play();
  const detail = await audioData;

  assert.equal(detail.requestId, "selected-blob");
  assert.equal(detail.mimeType, "audio/webm");
  assert.equal(Buffer.from(detail.base64Data, "base64").toString(), "small audio");
  dom.window.close();
});

test("page bridge captures an audio fetch response before background download is needed", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only", url: "https://www.messenger.com/t/example" });
  const blob = new dom.window.Blob(["fetched audio"], { type: "audio/mp4" });
  const response = {
    ok: true,
    headers: { get: (name) => name === "content-type" ? "audio/mp4" : null },
    clone: () => ({ blob: async () => blob })
  };
  dom.window.fetch = async () => response;
  dom.window.eval(bridgeSource);
  const audioData = new Promise((resolve) => {
    dom.window.addEventListener("voice-transcriber:audio-data-found", (event) => resolve(event.detail), { once: true });
  });

  dom.window.dispatchEvent(new dom.window.CustomEvent("voice-transcriber:capture-start", {
    detail: { requestId: "selected-fetch" }
  }));
  await dom.window.fetch("https://video.xx.fbcdn.net/selected-audio");
  const detail = await audioData;

  assert.equal(detail.requestId, "selected-fetch");
  assert.equal(detail.mimeType, "audio/mp4");
  assert.equal(Buffer.from(detail.base64Data, "base64").toString(), "fetched audio");
  dom.window.close();
});
