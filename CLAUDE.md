# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm run build    # bundles bin/cli.ts → dist/cli.mjs via tsdown with minification
```

No test or lint scripts are configured.

## Architecture

**acai** is a CLI tool (~500 lines of TypeScript) that generates git commit messages using the Claude Code CLI (`claude -p`). It has zero runtime dependencies — all packages are devDependencies bundled at build time.

### Data flow

1. **Preflight** — verify git repo and `claude` CLI availability
2. **File staging** — prompt user to stage files if nothing is staged (interactive multi-select grouped by status)
3. **Context gathering** — collect staged diff, stat, file list, and last 10 commit messages (for style inference)
4. **Generation** — spawn `claude -p` subprocess with system prompt (commit history for style) and user prompt (diff/stat/files), parse JSON response
5. **Review loop** — user can accept, edit in `$EDITOR`, revise with feedback (re-runs generation), copy to clipboard, or cancel

### Key modules

- `bin/cli.ts` — entry point and interactive flow orchestrator using `@clack/prompts`
- `src/claude.ts` — Claude CLI integration; builds prompts, spawns subprocess, parses response; includes intelligent diff truncation at hunk boundaries
- `src/git.ts` — git operations wrapper (diff, staging, commit via temp file to avoid shell escaping)
- `src/shell.ts` — low-level subprocess helpers (`run` returns null on failure, `runOrThrow` throws)
- `src/args.ts` — CLI argument parsing via `node:util parseArgs`; supports `-m`/`--model` flag and `ACAI_MODEL` env var

### Key design decisions

- Commit messages are written via temp file (`git commit -F`) rather than `-m` flag to avoid shell escaping issues
- Diff truncation preserves whole hunks rather than cutting mid-hunk
- Commit style is inferred from repo history (system prompt includes recent commits) rather than hardcoded conventions
- Clipboard support detects platform: pbcopy (macOS), xclip/xsel (X11), wl-copy (Wayland)
