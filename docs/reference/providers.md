---
title: Provider reference
doc_type: reference
layer: user
audience: Users and contributors
reader_goal: Compare supported providers and exact runtime behavior
source_of_truth: false
status: stable
last_verified: 2026-10-19
canonical_sources:
  - ../../src/shared/core.js
  - ../../src/background/transcription.js
related_docs:
  - ../research/platform-and-provider-sources.md
rag_index: true
---

# Provider reference

Provider availability, pricing, free allowances, retention policies, and model catalogs are external contracts. Confirm them in the linked official documentation before each release.

| Provider | Configured models | Modes | Transport | Key test |
|---|---|---|---|---|
| Gemini | Ordered multimodal Flash cascade | Verbatim, Cleaned, TL;DR, custom | `generateContent` with inline base64 audio | Small text-only generation request |
| Groq | `whisper-large-v3-turbo`, `whisper-large-v3` | All modes; processed modes use a Groq text model | Multipart | Models endpoint |
| Hugging Face | `openai/whisper-large-v3-turbo`, `openai/whisper-large-v3` | Verbatim | Raw bytes | Account identity endpoint |
| OpenAI | `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1` | Verbatim | Multipart | Models endpoint |
| xAI | `xai-stt` | Verbatim | Multipart | Models endpoint |
| ElevenLabs | `scribe_v2` | Verbatim | Multipart | Subscription endpoint |
| OpenRouter | `openai/gpt-4o-mini-transcribe`, `openai/gpt-4o-transcribe`, `openai/whisper-1` | Verbatim | Multipart | Models endpoint |

## Modes

- **Verbatim:** preserve language, slang, colloquialisms, and filler words while adding punctuation.
- **Cleaned:** remove empty filler, stutters, and hesitations without translating.
- **TL;DR:** return one to three short points in the spoken language.
- **Custom:** replace the built-in prompt with up to 4,000 characters.

Only Gemini and Groq currently support processed modes. Other providers are skipped when a processed mode or custom prompt is selected.

## Fallback semantics

Models are tried in the visible order for the current provider. With Advanced fallback enabled, providers are then tried in the visible order.

Retryable conditions include HTTP 408, 429, 500, 502, 503, and 504, request timeouts, transient network failures, and configured authentication failures. Unsupported audio, invalid content, and provider safety/content rejections are terminal.

Provider fallback can increase cost and sends the same selected audio to more than one configured provider after failures. The popup and privacy policy disclose this behavior.

## Audio contract

- Maximum inline payload: 14 MiB before base64 expansion.
- Supported containers: AAC, FLAC, MP4/M4A, MP3, OGG, Opus, WAV, and WebM.
- Common MIME aliases are normalized.
- Recognizable file signatures override incorrect CDN MIME metadata.
- HTML and JSON responses masquerading as audio are rejected.

The 14 MiB application limit stays below stricter provider request boundaries after JSON/base64 overhead and avoids excessive memory use in content scripts and the service worker.
