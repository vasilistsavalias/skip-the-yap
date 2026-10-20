# Privacy Policy

## Data handled

Skip the Yap! handles:

- the provider API keys you enter for Gemini, Groq, Hugging Face, OpenAI, xAI, ElevenLabs, or OpenRouter;
- audio from the specific voice note you choose to transcribe;
- the transcript returned by the selected provider;
- your local provider, mode, model, prompt, and clipboard preference.

## How data is used

API keys and preferences are stored in Chrome's local extension storage on your device. When you click **Transcribe**, the selected voice-note audio is sent over HTTPS directly to the provider selected in the popup. If you enable Advanced fallback, a provider failure may send the same audio to the next configured provider. Prompts and transcripts are also sent when a provider needs a text-processing step for Cleaned or TL;DR mode.

The extension developer does not operate a backend for this extension and does not receive, store, sell, or use your key, audio, transcript, browsing history, or settings. Data sent to a configured provider is subject to that provider's applicable API terms and privacy practices.

The extension accesses supported Messenger and Instagram pages only to identify the voice note you explicitly select and insert its transcript into the active message composer. It does not use data for advertising, profiling, credit decisions, or unrelated purposes, and it does not allow the developer or other humans to read your communications.

Use of information is limited to the extension's single purpose and follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Retention and deletion

The extension does not create a transcript history. Transcript text is placed in the page's active composer and is not saved by the extension. Use **Clear saved keys and settings** in the popup to remove extension storage, or remove the extension through Chrome to delete its local data.

## Security

Audio and API requests use HTTPS. No API key is bundled with the extension. Restrict keys to the required APIs where supported and rotate any exposed key.

## Changes

Material changes to these data practices must be disclosed in the extension UI and this policy before release.
