# github-memory-admin

A local admin UI for browsing and pruning GitHub Copilot memory files on disk.

## What it scans

- **User scope**
  - macOS/Linux: `~/.vscode/copilot/memories/`
  - Windows: `%APPDATA%\\Code\\User\\copilot\\memories\\`
- **Session scope**
  - `.github/copilot/memories/session/` inside the selected workspace
- **Repository scope**
  - `.github/copilot/memories/` inside the selected workspace
  - the `session/` subdirectory is excluded from repository results

The app only scans the local filesystem. It does not read or modify online GitHub memory data.

## Getting started

```bash
npm install
npm start
```

The app starts on `http://127.0.0.1:4173` by default and scans the current working directory as the workspace root.

## Usage

- Select **User memory**, **Session memory**, or **Repository memory**.
- Use the search box to filter the visible memory files.
- Use **Export JSON** to download the filtered result set.
- Use **Delete** to remove a specific local memory file.

## CLI options

- `--port=<number>`: override the listening port.
- `--host=<host>`: override the listening host.
- `--workspace=<path>`: override the workspace used for session and repository scopes.

## Development

Run the unit tests with:

```bash
npm test
```
