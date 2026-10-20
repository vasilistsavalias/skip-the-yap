---
title: Release runbook
doc_type: how-to
layer: operations
audience: Maintainers
reader_goal: Produce and validate a Chrome Web Store release
source_of_truth: true
status: stable
last_verified: 2026-10-20
canonical_sources:
  - ../../package.json
  - ../../tools/package.mjs
  - ../../store-assets/listing.md
related_docs:
  - ../reference/privacy-and-permissions.md
rag_index: true
---

# Release runbook

## 1. Prepare the version

1. Update the same version in `package.json`, `package-lock.json`, and `src/manifest.json`.
2. Add user-visible changes to `CHANGELOG.md`.
3. Confirm provider names and models against the official sources in `docs/research/`.
4. Confirm `PRIVACY.md`, the popup disclosure, and Store privacy answers describe identical behavior.

## 2. Verify

```bash
npm ci
npm run check
npm audit
npm run package
```

Manually test on current Chrome stable:

- Messenger direct conversation and group chat.
- Facebook Messages.
- Instagram Direct conversation and group chat.
- A stopped and already-playing voice note.
- Verbatim, Cleaned, and TL;DR where supported.
- Automatic composer insertion, click-again cancellation, optional clipboard copying, and clear-data actions.
- Every provider advertised in the Store listing with a real short test clip.
- Primary-model failure and configured provider fallback.

## 3. Inspect the artifact

The generated ZIP is `dist/skip-the-yap-<version>.zip`.

Confirm:

- `manifest.json` is at the ZIP root.
- Only runtime files from `src/` are present.
- No test, documentation, Git, local workspace, screenshot source, or key file is present.
- Manifest paths resolve inside the archive.
- The package loads successfully as an unpacked extension after extracting it.

## 4. Prepare the Store listing

Use:

- `store-assets/listing.md` for title, summary, description, and permission explanations.
- `store-assets/privacy-disclosures.md` for the Privacy Practices form.
- `store-assets/screenshots/` for synthetic-data screenshots.
- `store-assets/promo-small.png` for the small promotional tile.
- `src/assets/icons/icon128.png` for the Store icon.

Host `PRIVACY.md` at a stable public URL and enter that exact URL in the Developer Dashboard. A repository URL is acceptable only after the repository is public; GitHub Pages is preferable for a stable user-facing policy.

## 5. Publish safely

1. Tag the exact source commit. The release workflow verifies it, builds the ZIP, publishes the checksum, and creates the GitHub release.
2. Download and inspect that release ZIP.
3. Upload the same ZIP to the Chrome Web Store.
4. Complete Listing, Privacy, and Distribution sections.
5. Start with **Private** trusted testers.
6. Install the Store-delivered build and repeat the core smoke test.
7. Move to **Unlisted** or **Public** only after the installed package behaves identically.

Never rebuild between Store submission and the matching GitHub release; both should use the same inspected artifact.
