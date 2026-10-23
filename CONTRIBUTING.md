# Contributing

Focused bug reports and pull requests are welcome.

## Before opening an issue

- Search existing issues first.
- Confirm the problem on the current release and current Chrome stable.
- Include the site, extension version, provider, selected mode, and exact visible error.
- Never attach real conversations, voice notes, authenticated media URLs, account data, or credentials.
- Use synthetic or fully anonymized fixtures and screenshots.

Security vulnerabilities should follow [SECURITY.md](SECURITY.md), not a public issue.

## Development workflow

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Make one focused change under `src/`.
4. Add or update the narrowest behavior test under `tests/`.
5. Run `npm run check`.
6. Run `npm run package` when the change can affect the release artifact.

See the [development guide](docs/how-to/development.md) for runtime boundaries and provider requirements.

## Pull requests

- Explain the user-visible problem and result.
- Keep unrelated cleanup out of the diff.
- Update public documentation when setup, permissions, privacy, or behavior changes.
- Do not commit generated `dist/` files.
- Confirm the extension contains no bundled provider credential, analytics, or developer backend.

By contributing, you agree that your contribution is licensed under the repository's [GNU General Public License v3.0](LICENSE).
