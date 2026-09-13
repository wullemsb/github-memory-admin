# github-memory-admin

A local admin UI for browsing and pruning GitHub Copilot memory.

## Features

- Browse personal Copilot memory (`https://github.com/settings/copilot/memory`)
- Browse repository Copilot memory (`https://github.com/<owner>/<repo>/settings/copilot/memory`)
- Search the currently loaded memories
- Export the visible results to JSON
- Delete Copilot memory entries from the local UI
- Reuse a persistent Playwright browser profile so you only need to sign in once

## Getting started

```bash
npm install
npx playwright install chromium
npm start
```

The app starts on `http://127.0.0.1:4173` by default.

When you first load memory data, the tool launches a persistent Playwright-controlled Chromium window. Sign in to GitHub there, then refresh the local app.

## Usage

- Select **Personal memory** to browse user-level preferences.
- Select **Repository memory** and enter `owner/repo` to manage repository-level facts.
- Use the search box to filter the visible entries.
- Use **Export JSON** to download the filtered result set.
- Use **Delete** to remove a specific memory entry from GitHub.

## CLI options

- `--port=<number>`: override the listening port.
- `--host=<host>`: override the listening host.
- `--repo=<owner/repo>`: prefill the repository selector.
- `--headless`: run Playwright headless.

## Development

Run the unit tests with:

```bash
npm test
```

You can also supply mock data without talking to GitHub:

```bash
GITHUB_MEMORY_ADMIN_MOCK_DATA=/absolute/path/to/mock-data.json npm start
```

Expected format:

```json
{
  "memories": [
    { "buttonIndex": 0, "title": "Use TypeScript", "text": "Use TypeScript for new services." }
  ]
}
```
