---
title: Architecture
doc_type: explanation
layer: architecture
audience: Contributors and security reviewers
reader_goal: Understand runtime contexts, boundaries, and data flow
source_of_truth: true
status: stable
last_verified: 2026-10-19
canonical_sources:
  - ../../src/manifest.json
  - ../../src/shared/core.js
  - ../../src/background/transcription.js
related_docs:
  - ../reference/privacy-and-permissions.md
  - ../how-to/development.md
rag_index: true
---

# Architecture

Skip the Yap! is a dependency-free Manifest V3 runtime. Node dependencies are development-only and never enter the extension package.

## Runtime contexts

| Context | Source | Responsibility |
|---|---|---|
| Popup | `src/popup/` | Provider selection, key storage, mode preferences, optional permission requests |
| Isolated content script | `src/content/content-script.js` | Detect voice notes, mount controls, coordinate capture, render results, insert text |
| Content DOM module | `src/content/dom.js` | Site-specific detection and composer manipulation |
| Main-world bridge | `src/content/page-bridge.js` | Observe page-owned media activity during a bounded capture window |
| Service worker | `src/background/service-worker.js` | Capture matching network URLs, read settings, cancel work, dispatch transcription |
| Provider layer | `src/background/transcription.js` | Validate audio, shape API requests, classify failures, execute fallbacks |
| Shared core | `src/shared/core.js` | Provider/model allowlists, prompts, MIME normalization, URL validation, request IDs |

Only `page-bridge.js` runs in the page's JavaScript world. It has no access to extension storage, provider keys, or Chrome extension APIs.

## Capture sequence

1. A trusted user action targets one detected voice-note container.
2. The content script creates a random request ID and starts a four-second capture session.
3. The main-world bridge temporarily observes `fetch`, `XMLHttpRequest`, and media playback for that request.
4. The service worker concurrently observes allowed Meta media requests for the originating tab.
5. The selected play control is activated, muted, and stopped after its source is discovered.
6. Page-owned blobs are read in the page context; allowed HTTPS media URLs are downloaded by the service worker without credentials.
7. The payload is limited to 14 MiB, normalized to a supported audio MIME type, and checked for recognizable container signatures.
8. The service worker reads provider settings and starts transcription.

The capture window is request-scoped and tab-scoped. URLs outside the approved Meta host set are rejected, including the final destination after redirects.

## Provider routing

The primary provider is always first. Advanced fallback appends the user's ordered providers. Each provider has an ordered model allowlist controlled by `src/shared/core.js`; arbitrary model strings from storage are discarded.

The validated audio is prepared lazily:

- Gemini receives base64 audio in JSON.
- Groq, OpenAI, xAI, ElevenLabs, and OpenRouter receive multipart file uploads.
- Hugging Face receives raw audio bytes.

A Blob is allocated only when the selected provider requires it, and the same Blob is reused for subsequent multipart fallbacks.

Terminal input or policy failures stop the route. Temporary availability, timeouts, rate limits, network failures, and configured authentication failures may advance to the next configured route. The result always names the provider and model that succeeded.

## Trust boundaries

```text
Untrusted page DOM / page scripts
        │ bounded events, selected audio candidates
        ▼
Isolated content script
        │ validated extension messages
        ▼
Service worker and local settings
        │ HTTPS + user-owned provider credential
        ▼
Configured third-party AI provider
```

The webpage cannot read extension storage. Transcript rendering uses text nodes rather than untrusted HTML. Provider credentials are attached only to fixed provider endpoints and are never added to media downloads.

## Why there is no framework

The extension has one popup, one content workflow, and one background workflow. Direct browser APIs keep the published package small and auditable. A bundler, UI framework, dependency injection layer, or provider registry would add moving parts without solving a current requirement. The build step copies and validates runtime source; it does not transform it.
