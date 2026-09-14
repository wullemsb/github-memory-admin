# github-memory-admin

A local admin UI for browsing and pruning GitHub Copilot memory files on disk.

## What it scans

- **User scope**
  - macOS/Linux: `~/.vscode/copilot/memories/`
  - Windows: `%APPDATA%\\Code\\User\\copilot\\memories\\`
- **Session scope**
  - every `.github/copilot/memories/session/` directory found under the selected root directory
- **Repository scope**
  - every `.github/copilot/memories/` directory found under the selected root directory
  - each repository store excludes its `session/` subdirectory from repository results

The app only scans the local filesystem. It does not read or modify online GitHub memory data.

## Getting started

```bash
npm install
npm start
```

The app starts on `http://127.0.0.1:4173` by default and scans the current working directory recursively as the discovery root.

## Usage

- Start the app with `--root=/path/to/projects` to choose the directory tree to scan.
- Select **User memory**, **Session memory**, or **Repository memory**.
- Pick a discovered store from the sidebar.
- Inspect the matching memories and their contents.
- Use **Export JSON** to download the filtered result set.
- Use **Delete** to remove a specific local memory file.

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
