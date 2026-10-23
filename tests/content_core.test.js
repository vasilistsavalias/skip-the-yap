const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const contentCore = require("../src/content/dom.js");

const extension = require("node:path").resolve(__dirname, "..", "src");
const fs = require("node:fs");

test("detects a voice note without treating a normal message as one", () => {
  const dom = new JSDOM(`
    <body>
      <div id="message"><button aria-label="Reply">Reply</button><span>12:34</span></div>
      <div id="voice"><button aria-label="Play voice clip">Play</button><span>0:17</span></div>
    </body>
  `);
  assert.equal(contentCore.isVoiceContainer(dom.window.document.getElementById("message")), false);
  assert.equal(contentCore.isVoiceContainer(dom.window.document.getElementById("voice")), true);
});

test("detects an Instagram voice note whose play button has no accessible label", () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice"><button><svg></svg></button><span>0:05</span></div>
      <div id="message"><button><svg></svg></button><span>Hello</span></div>
    </body>
  `, { url: "https://www.instagram.com/direct/t/example/" });
  const voice = dom.window.document.getElementById("voice");
  assert.equal(contentCore.isVoiceContainer(voice), true);
  assert.equal(contentCore.findPlayControl(voice)?.tagName, "BUTTON");
  assert.equal(contentCore.isVoiceContainer(dom.window.document.getElementById("message")), false);
});

test("chooses Instagram's play control instead of menu or transcript actions", () => {
  const dom = new JSDOM(`
    <body>
      <div id="voice">
        <button id="menu" aria-label="More options"><svg></svg></button>
        <div id="waveform"><button id="play"><svg></svg></button><span>0:05</span></div>
        <button id="native-transcript">View transcript</button>
      </div>
    </body>
  `, { url: "https://www.instagram.com/direct/t/example/" });

  assert.equal(contentCore.findPlayControl(dom.window.document.getElementById("voice"))?.id, "play");
});

test("resolves nested Instagram controls to one outer voice-note bubble", () => {
  const dom = new JSDOM(`
    <body>
      <div id="message-row">
        <div id="bubble" style="background-color: rgb(38, 43, 51)">
          <div id="waveform"><button id="play"><svg></svg></button><span>0:05</span></div>
          <button id="native-transcript">View transcript</button>
        </div>
      </div>
    </body>
  `, { url: "https://www.instagram.com/direct/t/example/" });
  const document = dom.window.document;
  document.getElementById("waveform").getBoundingClientRect = () => ({ width: 230, height: 70 });
  document.getElementById("bubble").getBoundingClientRect = () => ({ width: 285, height: 110 });
  document.getElementById("message-row").getBoundingClientRect = () => ({ width: 900, height: 140 });

  assert.equal(contentCore.findVoiceContainer(document.getElementById("play"))?.id, "bubble");
  assert.equal(contentCore.findVoiceContainer(document.getElementById("native-transcript"))?.id, "bubble");
  assert.equal(contentCore.findVoiceAnchor(document.getElementById("bubble"))?.id, "bubble");
});

test("treats a voice note clipped outside its chat scrollport as hidden", () => {
  const dom = new JSDOM(`
    <body>
      <div id="chat" style="overflow-y: hidden">
        <div id="voice"><button aria-label="Play voice clip">Play</button><span>0:17</span></div>
      </div>
    </body>
  `, { pretendToBeVisual: true });
  const document = dom.window.document;
  const chat = document.getElementById("chat");
  const voice = document.getElementById("voice");
  chat.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 300, width: 400, height: 200 });
  voice.getBoundingClientRect = () => ({ left: 140, right: 340, top: 30, bottom: 90, width: 200, height: 60 });

  assert.equal(contentCore.isVisibleWithinClippingAncestors(voice, 800, 600), false);

  voice.getBoundingClientRect = () => ({ left: 140, right: 340, top: 130, bottom: 190, width: 200, height: 60 });
  assert.equal(contentCore.isVisibleWithinClippingAncestors(voice, 800, 600), true);
});

test("chooses the chat composer instead of a search textbox", () => {
  const dom = new JSDOM(`
    <body>
      <div role="textbox" contenteditable="true" aria-label="Search"></div>
      <div role="textbox" data-lexical-editor="true" contenteditable="true" aria-label="Message"></div>
    </body>
  `, { pretendToBeVisual: true });
  assert.equal(contentCore.findComposer(dom.window.document).getAttribute("aria-label"), "Message");
});

test("inserts into a textarea and verifies the resulting text", async () => {
  const dom = new JSDOM('<textarea aria-label="Message">Draft</textarea>', { pretendToBeVisual: true });
  const inserted = await contentCore.insertTranscript(dom.window.document, "transcript", { waitForPaint: async () => {} });
  assert.equal(inserted, true);
  assert.equal(dom.window.document.querySelector("textarea").value, "Draft transcript");
});

test("uses a verified contenteditable fallback when execCommand fails", async () => {
  const dom = new JSDOM('<div role="textbox" data-lexical-editor="true" contenteditable="true" aria-label="Message">Draft</div>', { pretendToBeVisual: true });
  const inserted = await contentCore.insertTranscript(dom.window.document, "transcript", {
    execCommand: () => false,
    waitForPaint: async () => {}
  });
  assert.equal(inserted, true);
  assert.equal(dom.window.document.querySelector('[role="textbox"]').textContent, "Draft transcript");
});

test("does not duplicate text when execCommand inserts but reports failure", async () => {
  const dom = new JSDOM('<div role="textbox" data-lexical-editor="true" contenteditable="true" aria-label="Message"></div>', { pretendToBeVisual: true });
  const document = dom.window.document;
  const composer = document.querySelector('[role="textbox"]');

  const inserted = await contentCore.insertTranscript(document, "transcript", {
    execCommand: (_command, _showUi, text) => {
      composer.append(document.createTextNode(text));
      return false;
    },
    waitForPaint: async () => {}
  });

  assert.equal(inserted, true);
  assert.equal(composer.textContent, "transcript");
});

test("mounts a transcription button after Messenger hydrates a voice note in stages", async () => {
  const dom = new JSDOM('<body><main id="thread"></main></body>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.messenger.com/t/example"
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({ success: true })
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };
  dom.window.eval(fs.readFileSync(`${extension}/shared/core.js`, "utf8"));
  dom.window.eval(fs.readFileSync(`${extension}/content/dom.js`, "utf8"));
  dom.window.eval(fs.readFileSync(`${extension}/content/content-script.js`, "utf8"));

  const voiceNote = dom.window.document.createElement("div");
  voiceNote.innerHTML = '<div><div><div><div><div><div><button aria-label="Play voice clip">▶</button></div></div></div></div></div></div>';
  dom.window.document.getElementById("thread").appendChild(voiceNote);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(voiceNote.querySelector(".vt-transcribe-trigger"), null);

  const duration = dom.window.document.createElement("span");
  duration.textContent = "0:21";
  voiceNote.appendChild(duration);
  await new Promise((resolve) => setTimeout(resolve, 180));

  const trigger = dom.window.document.querySelector(".vt-transcribe-trigger");
  assert.equal(trigger?.querySelector(".vt-trigger-icon")?.tagName.toLowerCase(), "svg");
  assert.equal(trigger?.getAttribute("aria-label"), "Transcribe voice note");
  assert.equal(trigger?.parentElement, dom.window.document.body);
  assert.equal(trigger?.classList.contains("vt-page-trigger"), true);
  assert.equal(dom.window.document.querySelectorAll(".vt-transcribe-trigger").length, 1);
  dom.window.close();
});

test("mounts a transcription button on an Instagram voice note with an unlabeled control", async () => {
  const dom = new JSDOM(`
    <body>
      <main id="message-row">
        <div id="voice">
          <div id="waveform"><button id="play"><svg></svg></button><span>0:05</span></div>
          <button id="native-transcript">View transcript</button>
        </div>
      </main>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.instagram.com/direct/t/example/"
  });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({ success: true })
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };
  dom.window.eval(fs.readFileSync(`${extension}/shared/core.js`, "utf8"));
  dom.window.eval(fs.readFileSync(`${extension}/content/dom.js`, "utf8"));
  dom.window.document.getElementById("waveform").getBoundingClientRect = () => ({ left: 52, right: 282, top: 100, bottom: 170, width: 230, height: 70 });
  dom.window.document.getElementById("voice").getBoundingClientRect = () => ({ left: 52, right: 337, top: 100, bottom: 210, width: 285, height: 110 });
  dom.window.document.getElementById("message-row").getBoundingClientRect = () => ({ left: 0, right: 900, top: 90, bottom: 230, width: 900, height: 140 });
  dom.window.eval(fs.readFileSync(`${extension}/content/content-script.js`, "utf8"));

  await new Promise((resolve) => setTimeout(resolve, 50));

  const trigger = dom.window.document.querySelector(".vt-transcribe-trigger");
  assert.equal(trigger?.getAttribute("aria-label"), "Transcribe voice note");
  assert.equal(trigger?.parentElement, dom.window.document.body);
  assert.equal(trigger?.classList.contains("vt-page-trigger"), true);
  assert.equal(trigger?.style.left, "383px");
  assert.equal(trigger?.style.top, "155px");
  assert.equal(dom.window.document.querySelectorAll(".vt-transcribe-trigger").length, 1);
  dom.window.close();
});

test("hides a Messenger control when its voice note scrolls outside the chat panel", async () => {
  const dom = new JSDOM(`
    <body>
      <div id="chat" style="overflow-y: hidden">
        <div id="voice"><button aria-label="Play voice clip">Play</button><span>0:17</span></div>
      </div>
    </body>
  `, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://www.messenger.com/t/example"
  });
  const document = dom.window.document;
  const chat = document.getElementById("chat");
  const voice = document.getElementById("voice");
  chat.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 300, width: 400, height: 200 });
  voice.getBoundingClientRect = () => ({ left: 140, right: 340, top: 30, bottom: 90, width: 200, height: 60 });
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({ success: true })
    },
    storage: { local: { get: async () => ({ autoCopyClipboard: false }) } }
  };
  dom.window.eval(fs.readFileSync(`${extension}/shared/core.js`, "utf8"));
  dom.window.eval(fs.readFileSync(`${extension}/content/dom.js`, "utf8"));
  dom.window.eval(fs.readFileSync(`${extension}/content/content-script.js`, "utf8"));

  const trigger = document.querySelector(".vt-transcribe-trigger");
  assert.equal(trigger?.hidden, true);

  voice.getBoundingClientRect = () => ({ left: 140, right: 340, top: 130, bottom: 190, width: 200, height: 60 });
  chat.dispatchEvent(new dom.window.Event("scroll"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(trigger?.hidden, false);
  assert.equal(trigger?.style.top, "160px");

  voice.querySelector("span").remove();
  chat.dispatchEvent(new dom.window.Event("scroll"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(trigger?.isConnected, false);
  dom.window.close();
});
