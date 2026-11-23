# Contributing to Quick Clip

Thank you for improving Quick Clip.

## Development workflow

1. Create a branch from the latest `main`.
2. Install dependencies with `npm ci`.
3. Run the application with `npm run dev`.
4. Keep changes focused and preserve the existing Socket.IO contract unless the change explicitly includes a coordinated migration.
5. Before opening a pull request, run:

   ```bash
   npm run build
   npm test
   ```

## Pull requests

Describe the user-facing outcome, the validation performed, and any deployment or compatibility considerations. Include screenshots for visible interface changes and update the README or event documentation when behavior changes.

Do not commit generated `dist/` output, dependencies, secrets, local workspace metadata, or `.env` files.

## Bug reports

Include reproduction steps, expected and actual behavior, browser and Node versions, and relevant logs with secrets removed. Security vulnerabilities must follow [SECURITY.md](SECURITY.md) instead of a public issue.
