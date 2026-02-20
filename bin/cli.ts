#!/usr/bin/env bun

import * as p from "@clack/prompts";
import { ensureGitRepo, getStagedDiff, getStagedStat, getStagedFiles, getUnstagedFiles, stageAll, stageFiles, getRecentCommitLog, commit } from "../src/git";
import { ensureClaude, generateCommitMessage } from "../src/claude";
import { parseConfig, printUsage } from "../src/args";

async function main() {
  const config = parseConfig();

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  p.intro("git-commit-ai");

  // ── Preflight checks ──────────────────────────────────────────────
  const s = p.spinner();

  try {
    await ensureGitRepo();
  } catch {
    p.cancel("Not a git repository.");
    process.exit(1);
  }

  try {
    await ensureClaude();
  } catch (e: any) {
    p.cancel(e.message);
    process.exit(1);
  }

  // ── Handle staging ─────────────────────────────────────────────────
  let diff = await getStagedDiff();

  if (!diff) {
    const unstaged = await getUnstagedFiles();
    if (unstaged.length === 0) {
      p.cancel("Nothing to commit — working tree clean.");
      process.exit(0);
    }

    const shouldStage = await p.confirm({
      message: "No staged changes. Stage all changes?",
      initialValue: true,
    });

    if (p.isCancel(shouldStage)) {
      p.cancel("Aborted.");
      process.exit(0);
    }

    if (shouldStage) {
      await stageAll();
    } else {
      // Group files by status for selection
      const groups: Record<string, { value: string; label: string }[]> = {};
      const labels: Record<string, string> = {
        modified: "Modified",
        untracked: "Untracked",
        deleted: "Deleted",
      };

      for (const file of unstaged) {
        const group = labels[file.status];
        groups[group] ??= [];
        groups[group].push({ value: file.path, label: file.path });
      }

      const selected = await p.groupMultiselect({
        message: "Select files to stage",
        options: groups,
      });

      if (p.isCancel(selected) || selected.length === 0) {
        p.cancel("Nothing staged.");
        process.exit(0);
      }

      await stageFiles(selected as string[]);
    }

    diff = await getStagedDiff();

    if (!diff) {
      p.cancel("Still no diff after staging. Nothing to commit.");
      process.exit(0);
    }
  }

  const stat = (await getStagedStat()) || "";
  const files = await getStagedFiles();
  p.log.info(`${files.length} file${files.length === 1 ? "" : "s"} staged`);

  // ── Gather repo style context ──────────────────────────────────────
  const commitLog = (await getRecentCommitLog(10)) || "";

  // ── Generate loop (generate → review → accept / revise / cancel) ──
  let instructions: string | undefined;

  while (true) {
    s.start("Generating commit message");

    let message: string;
    try {
      message = await generateCommitMessage({
        diff,
        stat,
        files,
        commitLog,
        model: config.model,
        instructions,
      });
    } catch (e: any) {
      s.stop("Failed");
      p.cancel(`Generation failed: ${e.message}`);
      process.exit(1);
    }

    s.stop("Done");

    // Display the message
    p.log.message(formatMessageForDisplay(message));

    const action = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "commit", label: "✓ Commit", hint: "accept and commit" },
        { value: "edit", label: "✎ Edit", hint: "open in $EDITOR before committing" },
        { value: "revise", label: "↻ Revise", hint: "give Claude feedback and regenerate" },
        { value: "regen", label: "⟳ Regenerate", hint: "try again from scratch" },
        { value: "copy", label: "⎘ Copy", hint: "copy to clipboard, don't commit" },
        { value: "cancel", label: "✕ Cancel" },
      ],
    });

    if (p.isCancel(action) || action === "cancel") {
      p.cancel("Aborted.");
      process.exit(0);
    }

    if (action === "commit") {
      await doCommit(message);
      break;
    }

    if (action === "edit") {
      const edited = await editInEditor(message);
      if (edited && edited.trim()) {
        await doCommit(edited.trim());
      } else {
        p.log.warn("Empty message after editing — not committing.");
        continue;
      }
      break;
    }

    if (action === "copy") {
      await copyToClipboard(message);
      p.outro("Copied to clipboard.");
      process.exit(0);
    }

    if (action === "revise") {
      const feedback = await p.text({
        message: "What should Claude change?",
        placeholder: "e.g. make it shorter, mention the API refactor, use past tense…",
      });

      if (p.isCancel(feedback) || !feedback) {
        continue;
      }

      instructions = `The user wants you to revise the message. Previous attempt was:\n\`\`\`\n${message}\n\`\`\`\nUser feedback: ${feedback}`;
      continue;
    }

    if (action === "regen") {
      instructions = undefined; // fresh attempt
      continue;
    }
  }
}

async function doCommit(message: string) {
  const s = p.spinner();
  s.start("Committing");
  try {
    await commit(message);
    s.stop("Committed!");
    p.outro("Done.");
  } catch (e: any) {
    s.stop("Failed");
    p.cancel(`Commit failed: ${e.message}`);
    process.exit(1);
  }
}

function formatMessageForDisplay(message: string): string {
  const lines = message.split("\n");
  const subject = lines[0];
  const body = lines.slice(1).join("\n").trim();

  let display = `\x1b[1;32m${subject}\x1b[0m`;
  if (body) {
    display += `\n\x1b[2m${body}\x1b[0m`;
  }
  return display;
}

async function editInEditor(message: string): Promise<string | null> {
  const { writeFileSync, readFileSync, unlinkSync } = await import("node:fs");
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmpPath = `/tmp/git-commit-ai-edit-${Date.now()}.txt`;

  writeFileSync(tmpPath, message, "utf-8");

  try {
    const proc = Bun.spawn([editor, tmpPath], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    return readFileSync(tmpPath, "utf-8");
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

async function copyToClipboard(text: string): Promise<void> {
  // Try common clipboard commands
  const cmds = [
    ["pbcopy"],            // macOS
    ["xclip", "-selection", "clipboard"],  // Linux X11
    ["xsel", "--clipboard", "--input"],    // Linux X11 alt
    ["wl-copy"],           // Wayland
  ];

  for (const cmd of cmds) {
    try {
      const proc = Bun.spawn(cmd, { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      if (code === 0) return;
    } catch {
      continue;
    }
  }

  // Fallback: just print it
  p.log.warn("Couldn't copy to clipboard. Here's the message:");
  console.log(text);
}

main().catch((e) => {
  p.cancel(e.message);
  process.exit(1);
});
