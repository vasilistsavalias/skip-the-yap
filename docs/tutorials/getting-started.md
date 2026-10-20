---
title: Getting started
doc_type: tutorial
layer: user
audience: First-time users
reader_goal: Produce a first voice-note transcript
source_of_truth: false
status: stable
last_verified: 2026-10-19
canonical_sources:
  - ../../src/manifest.json
  - ../reference/providers.md
related_docs:
  - ../reference/privacy-and-permissions.md
rag_index: true
---

# Getting started

This tutorial installs a local development build and transcribes one voice note. Start with a single provider; fallback routing can be added after the basic path works.

## Prerequisites

- Chrome or another Chromium browser with Manifest V3 support.
- Node.js 22 or newer.
- An account and API key for one [supported provider](../reference/providers.md).

## Build and load the extension

From the repository root:

```bash
npm install
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `dist/skip-the-yap`.
5. Pin **Skip the Yap!** to the toolbar.

When source files change, run `npm run build`, select **Reload** on the extension card, and reload the chat tab.

## Configure one provider

1. Open the extension popup.
2. Choose a provider.
3. Follow the provider-specific key guide shown in the popup.
4. Paste the key.
5. Select **Test** and approve access to that provider when Chrome asks.
6. Leave **Advanced fallback** disabled for the first test.
7. Choose **Verbatim** mode.

The permission prompt grants network access only to the selected provider. Keys are stored in Chrome's local extension storage and are not included in the repository or release package.

## Produce the first transcript

1. Open a conversation on Messenger, Facebook Messages, or Instagram Direct.
2. Reload the page if the extension was just installed.
3. Find a voice note. A blue microphone control should appear beside it.
4. Select the control once.
5. Wait for the microphone icon to return. The transcript is inserted directly into the active chat box.
6. Review or edit the text before sending it.

The transcript is also copied to the clipboard by default. Turn off **Also copy to clipboard** in the popup if you only want composer insertion.

The extension may briefly activate the selected voice note to discover its page-owned media request. It mutes and stops playback during this capture.

## If no control appears

- Confirm the URL is under `messenger.com`, `facebook.com/messages`, or `instagram.com/direct`.
- Reload the chat tab after installing or updating the extension.
- Scroll the voice note out of view and back to let the site hydrate it again.
- Confirm it is a voice note rather than a normal video or attachment.
- Run `npm run check` before reporting a regression.

## Add fallback routing

After one provider works:

1. Enable **Advanced fallback**.
2. Add a second provider.
3. Configure and test its key.
4. Order providers and their models from most preferred to least preferred.

Fallback occurs only for retryable failures such as temporary availability, rate limits, network errors, and configured authentication failures. Invalid audio and provider content rejections stop rather than silently sending the message elsewhere.
