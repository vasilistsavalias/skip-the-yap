# Chrome Web Store update guide

Use the canonical ZIP attached to the GitHub `v1.0.5` release. Do not rebuild it.

## Package

- Existing item ID: `pemnjegaecboifkcglcglokdinegfidf`
- Upload: `skip-the-yap-1.0.5.zip`

## Store listing

- **Name:** Skip the Yap!
- **Summary:** Turn Messenger and Instagram voice notes into transcripts, cleaned-up text, or a quick TL;DR with one click.
- **Category:** Productivity
- **Language:** English
- **Homepage:** https://github.com/vasilistsavalias/skip-the-yap
- **Support:** https://github.com/vasilistsavalias/skip-the-yap/issues

Replace the detailed description with the complete content under **Detailed description** in `store-assets/listing.md`. Do not add a standalone list of provider brands.

## Images

- Icon: `src/assets/icons/icon128.png`
- Screenshots, in filename order: `store-assets/screenshots/`
- Small promotional tile: `store-assets/promo-small.png`
- Marquee promotional image: `store-assets/promo-marquee.png`

The images already match the v1.0.5 interface; re-uploading them is optional if the Dashboard already contains these exact assets.

## Privacy

- Keep the existing disclosed categories: Authentication information, Personal communications, Website content.
- Privacy policy: https://github.com/vasilistsavalias/skip-the-yap/blob/main/PRIVACY.md
- Confirm the Limited Use certifications remain selected.

## Reviewer note

This update prioritizes fast free-tier-compatible Gemini Flash models with low/minimal thinking configuration, improves provider model discovery, and preserves custom model entries. Provider configuration, permissions, and data handling are unchanged.

## Submit

Upload the ZIP, save the compliant listing text, verify Privacy and Distribution, and submit the update for review. Existing users update automatically only after Google approves and publishes v1.0.5.
