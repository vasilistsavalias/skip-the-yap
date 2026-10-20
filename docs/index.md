---
title: Documentation
doc_type: reference
layer: user
audience: Users, contributors, and maintainers
reader_goal: Find the right guide for the current task
source_of_truth: true
status: stable
last_verified: 2026-10-19
rag_index: true
---

# Documentation

Use this page as the entry point. Each document has one job so setup instructions, architecture, exact contracts, and release procedures do not drift into competing versions.

## Tutorial

- [Getting started](tutorials/getting-started.md) — install the unpacked extension, configure one provider, and create a first transcript.

## How-to guides

- [Development](how-to/development.md) — change source, run focused checks, and add a provider safely.

## Explanation

- [Architecture](explanation/architecture.md) — understand extension contexts, capture flow, provider routing, and trust boundaries.

## Reference

- [Providers](reference/providers.md) — provider capabilities, models, request formats, and limits.
- [Privacy and permissions](reference/privacy-and-permissions.md) — exact data handling and manifest permission reasons.

## Operations

- [Release runbook](operations/releasing.md) — verify, package, inspect, and prepare a Chrome Web Store release.

## Research

- [Platform and provider sources](research/platform-and-provider-sources.md) — official documentation used to validate policies and API contracts.

## Active sources of truth

- Runtime manifest: [`src/manifest.json`](../src/manifest.json)
- Shared provider and model configuration: [`src/shared/core.js`](../src/shared/core.js)
- Provider request adapters: [`src/background/transcription.js`](../src/background/transcription.js)
- Privacy contract: [`PRIVACY.md`](../PRIVACY.md)
- Commands: [`package.json`](../package.json)

There is no archived or legacy runtime in this repository.
