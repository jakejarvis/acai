import { writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { run, runOrThrow } from "./shell";

export async function ensureGitRepo() {
  const result = await run(["git", "rev-parse", "--is-inside-work-tree"]);
  if (result !== "true") {
    throw new Error("Not inside a git repository.");
  }
}

export async function getStagedDiff(): Promise<string | null> {
  return run(["git", "diff", "--cached"]);
}

export async function getStagedStat(): Promise<string | null> {
  return run(["git", "diff", "--cached", "--stat"]);
}

export async function getStagedFiles(): Promise<string[]> {
  const result = await run(["git", "diff", "--cached", "--name-only"]);
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}

export async function hasUnstagedChanges(): Promise<boolean> {
  const files = await getUnstagedFiles();
  return files.length > 0;
}

export interface UnstagedFile {
  path: string;
  status: "modified" | "untracked" | "deleted";
}

/**
 * Return all unstaged/untracked files with their status.
 * Parses the index (XY) columns of `git status --porcelain`.
 */
export async function getUnstagedFiles(): Promise<UnstagedFile[]> {
  const raw = await run(["git", "status", "--porcelain"]);
  if (!raw) return [];

  const files: UnstagedFile[] = [];

  for (const line of raw.split("\n")) {
    if (!line) continue;
    const wt = line[1]; // working-tree status (second char)
    const path = line.slice(3);

    if (line.startsWith("??")) {
      files.push({ path, status: "untracked" });
    } else if (wt === "D") {
      files.push({ path, status: "deleted" });
    } else if (wt === "M" || wt === "A") {
      files.push({ path, status: "modified" });
    }
  }

  return files;
}

export async function stageAll(): Promise<void> {
  await runOrThrow(["git", "add", "-A"]);
}

export async function stageFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await runOrThrow(["git", "add", "--", ...paths]);
}

/**
 * Get the last N non-merge commit messages (subject + body).
 */
export async function getRecentCommitLog(count = 10): Promise<string | null> {
  return run([
    "git",
    "log",
    `--format=%s%n%b%n---`,
    `-n`,
    String(count),
    "--no-merges",
  ]);
}

/**
 * Commit using a temp file (avoids shell escaping nightmares).
 */
export async function commit(message: string): Promise<void> {
  const tmpPath = `/tmp/git-commit-ai-${Date.now()}.txt`;
  writeFileSync(tmpPath, message, "utf-8");

  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const proc = spawn("git", ["commit", "-F", tmpPath], {
        stdio: "inherit",
      });
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    if (code !== 0) throw new Error("git commit failed");
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {}
  }
}
