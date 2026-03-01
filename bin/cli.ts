#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { parseConfig, printUsage } from "../src/args";
import {
  commit,
  ensureGitRepo,
  getRecentCommitLog,
  getStagedDiff,
  getStagedFiles,
  getStagedStat,
  getUnstagedFiles,
  stageAll,
  stageFiles,
  type UnstagedFile,
} from "../src/git";
import {
  ensureProvider,
  generateCommitMessage,
  providers,
} from "../src/providers";

async function main() {
  const config = parseConfig();

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  const provider = providers[config.provider];
  if (!provider) {
    const available = Object.keys(providers).join(", ");
    console.error(
      `Unknown provider "${config.provider}". Available: ${available}`,
    );
    process.exit(1);
  }

  const model = config.model || provider.defaultModel;

  p.intro("acai");

  // ── Preflight checks ──────────────────────────────────────────────
  const s = p.spinner();

  try {
    await ensureGitRepo();
  } catch {
    p.cancel("Not a git repository.");
    process.exit(1);
  }

  try {
    await ensureProvider(provider);
  } catch (e: unknown) {
    p.cancel((e as Error).message);
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

    if (config.yolo) {
      await stageAll();
    } else {
      const shouldStage = await p.confirm({
        message: "Stage all changes?",
        initialValue: true,
      });

      if (p.isCancel(shouldStage)) {
        p.cancel("Aborted.");
        process.exit(0);
      }

      if (shouldStage) {
        await stageAll();
      } else {
        const picked = await promptFilePicker(
          unstaged,
          "Select files to stage",
        );
        if (!picked) {
          p.cancel("Nothing staged.");
          process.exit(0);
        }
      }
    }

    diff = await getStagedDiff();

    if (!diff) {
      p.cancel("Still no diff after staging. Nothing to commit.");
      process.exit(0);
    }
  }

  // ── Offer to stage additional unstaged files ────────────────────────
  if (!config.yolo) {
    const remaining = await getUnstagedFiles();
    if (remaining.length > 0) {
      const addMore = await p.confirm({
        message: `${remaining.length} other changed file${remaining.length === 1 ? "" : "s"} not staged. Add more?`,
        initialValue: false,
      });

      if (p.isCancel(addMore)) {
        p.cancel("Aborted.");
        process.exit(0);
      }

      if (addMore) {
        await promptFilePicker(remaining, "Select additional files to stage");

        // Re-fetch diff since staging changed
        // biome-ignore lint/style/noNonNullAssertion: diff is guaranteed to be non-null
        diff = (await getStagedDiff())!;
      }
    }
  }

  const stat = (await getStagedStat()) || "";
  const files = await getStagedFiles();
  const MAX_LISTED = 5;
  const listed = files.slice(0, MAX_LISTED).join(", ");
  const extra =
    files.length > MAX_LISTED ? ` and ${files.length - MAX_LISTED} more` : "";
  p.log.info(
    `Staged ${files.length} file${files.length === 1 ? "" : "s"}: ${pc.dim(listed + extra)}`,
  );

  // ── Gather repo style context ──────────────────────────────────────
  const commitLog = (await getRecentCommitLog(10)) || "";

  // ── Generate loop (generate → review → accept / revise / cancel) ──
  let instructions: string | undefined;

  while (true) {
    s.start(`Waiting for ${provider.name}`);

    let message: string;
    try {
      message = await generateCommitMessage(provider, {
        diff,
        stat,
        files,
        commitLog,
        model,
        instructions,
        log: config.verbose ? (msg) => p.log.message(pc.dim(msg)) : undefined,
      });
    } catch (e: unknown) {
      s.stop("Failed");
      p.cancel(`Generation failed: ${(e as Error).message}`);
      process.exit(1);
    }

    s.stop(
      `Here's what ${provider.name} ${pc.dim(`(${model})`)} came up with:`,
    );

    // Display the message
    p.log.message(formatMessageForDisplay(message));

    if (config.yolo) {
      await doCommit(message);
      break;
    }

    const action = await p.select({
      message: "What should we do?",
      options: [
        { value: "commit", label: "✓ Commit" },
        {
          value: "edit",
          label: "✎ Edit",
          hint: "open in editor and commit on save",
        },
        {
          value: "revise",
          label: "↻ Revise",
          hint: `give ${provider.name} feedback and try again`,
        },
        {
          value: "copy",
          label: "⎘ Copy",
          hint: "copy message to clipboard and exit",
        },
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
      if (edited?.trim()) {
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
        message: `What should ${provider.name} change?`,
        placeholder:
          "e.g. make it shorter, mention the API refactor, use past tense…",
      });

      if (p.isCancel(feedback) || !feedback) {
        continue;
      }

      instructions = `The user wants you to revise the message. Previous attempt was:\n\`\`\`\n${message}\n\`\`\`\nUser feedback: ${feedback}`;
    }
  }
}

/**
 * Show a grouped multi-select file picker and stage the selected files.
 * Returns true if files were staged, false if cancelled/empty.
 */
async function promptFilePicker(
  files: UnstagedFile[],
  message: string,
): Promise<boolean> {
  const STATUS_LABELS: Record<string, string> = {
    modified: "Modified",
    untracked: "Untracked",
    deleted: "Deleted",
  };

  const groups: Record<string, { value: string; label: string }[]> = {};

  for (const file of files) {
    const group = STATUS_LABELS[file.status];
    groups[group] ??= [];
    groups[group].push({ value: file.path, label: file.path });
  }

  const selected = await p.groupMultiselect({ message, options: groups });

  if (p.isCancel(selected) || selected.length === 0) return false;

  await stageFiles(selected as string[]);
  return true;
}

async function doCommit(message: string) {
  const s = p.spinner();
  s.start("Committing");
  try {
    await commit(message);
    s.stop("Committed!");
  } catch (e: unknown) {
    s.stop("Failed");
    p.cancel(`Commit failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

function formatMessageForDisplay(message: string): string {
  const lines = message.split("\n");
  const subject = lines[0];
  const body = lines.slice(1).join("\n").trim();

  let display = pc.bold(pc.green(subject));
  if (body) {
    display += `\n${pc.dim(body)}`;
  }
  return display;
}

async function editInEditor(message: string): Promise<string | null> {
  const { spawn } = await import("node:child_process");
  const { writeFileSync, readFileSync, mkdtempSync, rmSync } = await import(
    "node:fs"
  );
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmpDir = mkdtempSync(join(tmpdir(), "acai-"));
  const tmpPath = join(tmpDir, "COMMIT_EDITMSG");

  writeFileSync(tmpPath, message, "utf-8");

  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      // Run through shell so EDITOR="code --wait" and similar values work
      const proc = spawn(editor, [tmpPath], { stdio: "inherit", shell: true });
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    if (code !== 0) return null;
    return readFileSync(tmpPath, "utf-8");
  } finally {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  }
}

async function copyToClipboard(text: string): Promise<void> {
  const { spawn } = await import("node:child_process");

  // Try common clipboard commands
  const cmds = [
    ["pbcopy"], // macOS
    ["xclip", "-selection", "clipboard"], // Linux X11
    ["xsel", "--clipboard", "--input"], // Linux X11 alt
    ["wl-copy"], // Wayland
  ];

  for (const [bin, ...args] of cmds) {
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn(bin, args, { stdio: ["pipe", "ignore", "ignore"] });
      proc.on("error", () => resolve(false));
      proc.stdin.write(text);
      proc.stdin.end();
      proc.on("close", (code) => resolve(code === 0));
    });
    if (ok) return;
  }

  // Fallback: just print it
  p.log.warn("Couldn't copy to clipboard. Here's the raw message:");
  console.log(text);
}

main().catch((e) => {
  p.cancel(e.message);
  process.exit(1);
});
