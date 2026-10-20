---
title: Privacy and permissions reference
doc_type: reference
layer: user
audience: Users, reviewers, and maintainers
reader_goal: Understand every permission and data transfer
source_of_truth: false
status: stable
last_verified: 2026-10-19
canonical_sources:
  - ../../PRIVACY.md
  - ../../src/manifest.json
rag_index: true
---

# Privacy and permissions reference

The [Privacy Policy](../../PRIVACY.md) is the controlling public statement. This page explains the technical mechanisms behind it.

## Data categories

| Data | Where it originates | Where it goes | Retention by the extension |
|---|---|---|---|
| Provider API keys | Popup input | Chrome local extension storage; selected provider API | Until the user clears extension data or removes the extension |
| Selected voice-note audio | Supported chat page | Selected provider and configured fallbacks | Not retained after the request |
| Transcript | Provider response | In-page card, optional composer, optional clipboard | Not stored by the extension |
| Preferences | Popup controls | Chrome local extension storage | Until cleared or removed |
| Media URL | Selected chat request | Service worker download | Request-scoped only; not logged or stored |

Third-party providers process data under their own API terms and privacy policies. The extension developer has no backend and does not receive these requests.

## Required permissions

| Permission or origin | Reason |
|---|---|
| `clipboardWrite` | Copy a finished transcript when clipboard copying is enabled or no chat composer is available; the extension never reads the clipboard |
| `storage` | Store provider keys and user preferences locally |
| `webRequest` | Observe the selected page's short-lived media request when the DOM does not expose a usable source |
| Messenger, Facebook, Instagram origins | Detect supported voice notes and insert transcript text into the active composer |
| Meta media/CDN origins | Download the selected voice note when the page exposes a remote media URL |

## Optional provider origins

Provider API origins are declared under `optional_host_permissions`. Chrome asks for access when the user selects **Test** for that provider. This avoids granting every provider origin during installation.

The extension cannot send audio to a provider whose origin permission has not been granted. Revoking a provider's site access disables that provider until access is granted again.

## Chrome Web Store declarations

The Store Privacy Practices form should disclose:

- **Authentication information:** user-provided API keys.
- **Personal communications:** selected voice-note audio and returned transcripts.
- **Website content:** the selected chat media and composer insertion.

The single purpose is: **transcribe a voice note explicitly selected by the user on a supported chat service and present the resulting text.**

Data is not sold, used for advertising, used for credit decisions, or made available for unrelated human review. Advanced fallback transfers audio only to providers explicitly configured by the user and only as necessary to complete that purpose.
