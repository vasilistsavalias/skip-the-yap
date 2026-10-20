---
title: Development
doc_type: how-to
layer: user
audience: Contributors
reader_goal: Make and verify a focused code change
source_of_truth: false
status: stable
last_verified: 2026-10-19
canonical_sources:
  - ../../package.json
  - ../../src/manifest.json
related_docs:
  - ../explanation/architecture.md
  - ../operations/releasing.md
rag_index: true
---

# Development

## Set up

```bash
npm install
npm run check
```

Node.js 22 or newer is required. All installed packages are development dependencies; the extension runtime is plain JavaScript, HTML, and CSS.

## Work on the extension

1. Change files under `src/`.
2. Add or update the narrowest behavior test under `tests/`.
3. Run the focused test with `node --test tests/<file>.test.js`.
4. Run `npm run build`.
5. Reload `dist/skip-the-yap` from `chrome://extensions`.
6. Reload the affected chat page and perform the changed user journey.
7. Run `npm run check` before committing.

Do not edit `dist/`; it is generated from `src/`.

## Add or update a provider

A provider change normally touches these contracts together:

1. Add its ID, model allowlist, and optional host origins in `src/shared/core.js`.
2. Add or update the adapter in `src/background/transcription.js`.
3. Route it from `transcribeAudio` and `testProviderApiKey`.
4. Add popup metadata and a setup guide in `src/popup/popup.js`.
5. Add the optional origin to `src/manifest.json`.
6. Add request-shape, fallback, and authentication tests.
7. Update `docs/reference/providers.md` and the Privacy Policy when the data flow changes.
8. Verify the real endpoint with a user-owned test key before advertising support.

Do not add a provider merely because it offers text generation. It must expose a usable audio transcription or multimodal-audio endpoint that can be called directly from a Chrome extension.

## Change site detection

Messenger and Instagram ship frequently changing DOM structures. Keep selectors and heuristics in `src/content/dom.js`; keep orchestration in `content-script.js`.

A regression fixture should prove both sides:

- the target voice note is detected;
- a nearby normal message, video, search box, or unrelated control is not detected.

Never include real user HTML, names, avatars, message text, audio, or authenticated URLs in fixtures.

## Security invariants

- Only a trusted user action may start transcription.
- Page-world code never receives provider keys.
- Media URLs must be HTTPS and match the explicit Meta host allowlist before and after redirects.
- Model and provider identifiers come from allowlists, not arbitrary storage values.
- Transcripts and provider errors are rendered as text, not HTML.
- No sensitive content is written to the console.
- Release archives contain only built extension files.
