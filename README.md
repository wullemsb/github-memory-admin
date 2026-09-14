# github-memory-admin

A local admin UI for browsing and pruning GitHub Copilot memory files on disk.

## What it scans

- **User scope**
  - Windows: `%APPDATA%\\Code\\User\\globalStorage\\github.copilot-chat\\memory-tool\\memories\\`
  - macOS: `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/memory-tool/memories/`
  - Linux: `~/.config/Code/User/globalStorage/github.copilot-chat/memory-tool/memories/`
- **Session scope**
  - every `github.copilot-chat/memory-tool/memories/session/` directory found under the selected root directory
- **Repository scope**
  - every `github.copilot-chat/memory-tool/memories/repo/` directory found under the selected root directory
  - by default the root directory is the local VS Code `workspaceStorage` directory

The app only scans the local filesystem. It does not read or modify online GitHub memory data.

## Getting started

```bash
npm install
npm start
```

The app starts on `http://127.0.0.1:4173` by default and scans the local VS Code `workspaceStorage` directory recursively as the discovery root.

## Usage

- Start the app with `--root=/path/to/workspaceStorage` to choose the directory tree to scan.
- Review the combined view with **User scope** first, followed by discovered **Repository scope** stores.
- Pick a discovered store from the sidebar.
- Inspect the matching memories and their contents.
- Use **Export JSON** to download the filtered result set.
- Use **Delete** to remove a specific local memory file.
- The browser UI exposes that combined user/repository view; the HTTP API still accepts `user`, `session`, `repo`, and `combined` scopes for direct requests.

## CLI options

- `--port=<number>`: override the listening port.
- `--host=<host>`: override the listening host.
- `--root=<path>`: override the root directory scanned for repository and session stores.
- `--workspace=<path>`: backwards-compatible alias for `--root`.

## Development

Run the unit tests with:

```bash
npm test
```
