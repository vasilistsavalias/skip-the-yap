# Chrome Web Store privacy disclosures

Use this as submission working copy. Confirm the form wording against the current Developer Dashboard before every release.

## Single purpose

Transcribe a voice note explicitly selected by the user on a supported chat service and present the resulting text.

## Data categories to disclose

- **Authentication information:** API keys entered by the user.
- **Personal communications:** the selected voice-note audio and returned transcript.
- **Website content:** the selected media and text inserted into the composer at the user's request.

## Certifications

The extension:

- does not sell user data;
- does not use or transfer user data for advertising;
- does not use or transfer user data for creditworthiness or lending;
- does not permit unrelated human access to user data;
- uses data only to provide the extension's disclosed single purpose;
- stores provider keys and settings locally in Chrome extension storage;
- sends selected audio directly to providers configured by the user;
- does not operate a developer backend or retain transcript history.

## Privacy policy URL

Publish `PRIVACY.md` at a stable public HTTPS URL before submitting the Store listing, then enter that exact URL in the Dashboard.

## Reviewer note

Provider domains are optional host permissions. Access is requested when a user tests that provider, before the provider can receive audio. Advanced fallback may send the same selected audio to another provider explicitly configured by the user after a retryable failure.
