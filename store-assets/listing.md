# Chrome Web Store listing

## Name

Skip the Yap!

## Short description

Turn Messenger and Instagram voice notes into readable transcripts or quick summaries with one click.

## Detailed description

Let them yap. You get the point.

Your friends can yap. You do not have to listen. Skip the Yap! adds a small transcription control beside supported Messenger, Facebook Messages, and Instagram Direct voice notes. Select a note to get the complete transcript, clean up the rambling, or skip straight to the key points.

The extension captures only the voice note you select and sends it directly to the AI provider you configured.

Features:

- Transcribe one selected voice note at a time.
- Use your own Gemini, Groq, Hugging Face, OpenAI, xAI, ElevenLabs, or OpenRouter key.
- Choose Verbatim, Cleaned, TL;DR, or a custom prompt where supported.
- Insert the result directly into the active chat composer and copy it to the clipboard by default. Clipboard copying can be disabled.
- Configure ordered provider and model fallbacks for temporary failures.
- Keep settings and provider keys in local Chrome extension storage.

Privacy by design:

- No developer-operated backend.
- No analytics, advertising, or transcript history.
- Provider access is requested only when you configure and test that provider.
- Audio goes directly to providers you explicitly configure and is governed by their API terms.

This independent project is not affiliated with or endorsed by Meta, Facebook, Instagram, Google, OpenAI, xAI, Groq, ElevenLabs, Hugging Face, or OpenRouter.

## Category

Productivity

## Language

English listing; transcription language support depends on the selected provider and model.

## Permission justifications

- **clipboardWrite:** copy the finished transcript when clipboard copying is enabled or no chat box is available. The extension never reads the clipboard.
- **storage:** save provider keys and extension preferences locally.
- **webRequest:** observe the selected page's short-lived media request when its audio source is not exposed in the DOM.
- **Messenger, Facebook, and Instagram:** detect supported voice notes, display results, and insert text when requested.
- **Meta media hosts:** download only the selected voice note.
- **Optional provider hosts:** call only providers configured and approved by the user.
