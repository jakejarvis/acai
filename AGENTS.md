# CLAUDE.md

This file provides guidance to agents when working with code in this repository.

## Build & Quality

```bash
npm run build        # bundles bin/cli.ts → dist/cli.mjs via tsdown with minification
npm run lint         # biome check
npm run format       # biome format --write
npm run check-types  # tsc --noEmit
```

No test suite is configured.

## Architecture

**acai** is an opinionated CLI tool that generates git commit messages using already-installed AI tools (Claude Code, OpenAI Codex).

### Data flow

1. **Preflight** — verify git repo and selected provider CLI availability
2. **File staging** — prompt user to stage files if nothing is staged (interactive multi-select grouped by status)
3. **Context gathering** — collect staged diff, stat, file list, and last 10 commit messages (for style inference)
4. **Generation** — spawn provider CLI subprocess with system prompt (commit history for style) and user prompt (diff/stat/files), parse response
5. **Review loop** — user can accept, edit in `$EDITOR`, revise with feedback (re-runs generation), copy to clipboard, or cancel

### Key modules

- `bin/cli.ts` — entry point and interactive flow orchestrator using `@clack/prompts`
- `src/provider.ts` — provider interface, registry (claude + codex), `ensureProvider()` and `generateCommitMessage()` functions
- `src/prompts.ts` — shared prompt-building logic (`buildSystemPrompt`, `buildUserPrompt`) and intelligent diff truncation at hunk boundaries
- `src/git.ts` — git operations wrapper (diff, staging, commit via temp file to avoid shell escaping)
- `src/args.ts` — CLI argument parsing via `node:util parseArgs`; supports `-p`/`--provider`, `-m`/`--model`, `-y`/`--yolo` flags and `ACAI_PROVIDER`/`ACAI_MODEL` env vars

### Key design decisions

- Commit messages are written via temp file (`git commit -F`) rather than `-m` flag to avoid shell escaping issues
- Diff truncation preserves whole hunks rather than cutting mid-hunk
- Commit style is inferred from repo history (system prompt includes recent commits) rather than hardcoded conventions
- Clipboard support detects platform: pbcopy (macOS), xclip/xsel (X11), wl-copy (Wayland)
