---
title: Platform and provider sources
doc_type: research-note
layer: research
audience: Maintainers
reader_goal: Revalidate external policies and API contracts
source_of_truth: false
status: stable
last_verified: 2026-10-19
rag_index: true
---

# Platform and provider sources

This is a verification index, not a substitute for the providers' live documentation. External model catalogs, quotas, pricing, policies, and payload contracts can change without a repository update.

## Chrome Web Store

- [Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Privacy Policy, Limited Use, disclosures, permissions, and handling](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/user_data)
- [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Store image requirements](https://developer.chrome.com/docs/webstore/images)
- [Register a developer account](https://developer.chrome.com/docs/webstore/register/)
- [Two-step verification requirement](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)

## Provider APIs

- Gemini: [models](https://ai.google.dev/gemini-api/docs/models), [audio understanding](https://ai.google.dev/gemini-api/docs/audio), [dedicated transcription](https://ai.google.dev/gemini-api/docs/transcribe)
- Groq: [speech to text](https://console.groq.com/docs/speech-to-text), [rate limits](https://console.groq.com/docs/rate-limits)
- Hugging Face: [automatic speech recognition](https://huggingface.co/docs/inference-providers/tasks/automatic-speech-recognition), [HF Inference](https://huggingface.co/docs/inference-providers/providers/hf-inference)
- OpenAI: [audio transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- xAI: [speech-to-text REST API](https://docs.x.ai/developers/rest-api-reference/inference/speech-to-text)
- ElevenLabs: [create transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- OpenRouter: [transcription guide](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/)

## Open-source and intellectual-property references

- [The legal side of open source](https://opensource.guide/legal/)
- [Chrome Web Store impersonation and intellectual-property policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)
- [US Copyright Office: Copyright and Artificial Intelligence](https://www.copyright.gov/ai/)

## Structural reference

- [uBlock Origin repository](https://github.com/gorhill/uBlock) — referenced for its clear separation of source, platform packaging, tools, tests, assets, documentation, and generated distributions. No uBlock code or branding is included in this project.

## Release research checklist

Before a public release, check each provider for:

- current endpoint and authentication header;
- current model IDs and deprecations;
- supported audio formats and file-size limit;
- free allowance versus required billing;
- browser/CORS compatibility;
- data retention and training controls;
- rate-limit response and `Retry-After` behavior.
