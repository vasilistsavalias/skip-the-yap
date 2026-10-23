# Changelog

All notable user-visible changes are documented here.

## [1.0.3] - 2026-10-23

### Added

- A What's new panel in the extension popup with the installed version and latest fixes.

### Changed

- The popup version now comes directly from the installed extension manifest.
- The popup keeps routine setup details out of the main view, moves privacy details into the product tour, and groups clipboard, provider fallback, and confirmed clear-data controls inside a collapsible Advanced settings panel.
- Transcription controls are larger and easier to target without covering the voice note.
- Chrome Web Store screenshots and listing copy now reflect the current Messenger, Instagram, transcription-mode, and privacy experience.

### Fixed

- Transcription controls now use native CSS anchor positioning in supported Chrome versions so they stay attached to their voice DM and disappear with it while scrolling.

## [1.0.2] - 2026-10-23

### Fixed

- Duplicate transcript insertion when Messenger updates its composer asynchronously.
- Transcription controls remaining visible after their voice notes scroll outside the chat panel.

## [1.0.1] - 2026-10-21

### Added

- Instagram Direct voice-note transcription.
- Bring-your-own-key support for Gemini, Groq, Hugging Face, OpenAI, xAI, ElevenLabs, and OpenRouter.
- Ordered provider and model fallback controls.
- Optional host permissions requested only for configured providers.
- Reproducible build and Chrome Web Store packaging commands.
- Public architecture, provider, privacy, development, and release documentation.
- Skip the Yap! branding and production icon set.

### Changed

- Reorganized runtime code under `src/` and separated generated releases, tooling, tests, documentation, branding, and Store materials.
- Hardened selected-audio capture, payload validation, request cancellation, redirect validation, and trusted-action checks.
- Improved popup setup guidance, readable provider errors, and transcript insertion behavior.

### Fixed

- Voice-note controls being attached to unrelated Instagram elements.
- Duplicate or misplaced Instagram transcription controls.
- Audio playback continuing during capture.
- Empty transcripts, generic abort errors, and clipped connection errors.
- Messenger and Instagram composer insertion failures.
