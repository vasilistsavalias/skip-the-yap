# Chrome Web Store listing

## Name

Skip the Yap!

## Short description

Turn Messenger and Instagram voice notes into transcripts, cleaned-up text, or a quick TL;DR with one click.

## Detailed description

Let them yap. You get the point.

Skip the Yap! puts a transcription button next to supported voice notes in Messenger and Instagram DMs. The button stays attached to the right voice note while you scroll. Click it for the full transcript, a cleaned-up version, or a quick TL;DR.

The result is inserted into the active chat box automatically. You can also copy it to the clipboard.

Bring your own API key:

Choose Gemini, Groq, Hugging Face, OpenAI, xAI, ElevenLabs, or OpenRouter. There is no extension account and no developer-operated backend. The extension is free; your chosen provider may charge for API usage.

What it does:

- Transcribes only the voice note you select.
- Works in Messenger, Facebook Messages, and Instagram DMs.
- Offers Verbatim, Cleaned, TL;DR, and custom prompts where supported.
- Keeps the transcription button beside its voice note as the conversation scrolls.
- Inserts the result into the active chat box and can copy it to the clipboard.
- Supports ordered provider and model fallbacks.
- Stores your keys and settings in Chrome's local extension storage.

Privacy:

- No analytics, ads, behavioral tracking, or transcript history.
- The extension does not read or upload voice notes automatically.
- Only the voice note you choose is sent directly to providers you configure.
- The developer cannot access your keys, audio, transcripts, conversations, or settings.
- You can clear every saved key and setting from Advanced settings.

Your chosen AI provider handles the selected audio under its own API terms and privacy policy.

Skip the Yap! is free and open source. It is an independent project and is not affiliated with Meta or any supported AI provider.

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
