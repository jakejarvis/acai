import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

/**
 * Run a command and return its stdout as a string.
 * Returns null if the command fails.
 */
async function run(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<string | null> {
  const [bin, ...args] = cmd;
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      resolve(code === 0 ? stdout.trim() : null);
    });
  });
}

/**
 * Run a command, returning stdout. Throws on failure.
 */
async function runOrThrow(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<string> {
  const result = await run(cmd, opts);
  if (result === null) {
    throw new Error(`Command failed: ${cmd.join(" ")}`);
  }
  return result;
}

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
  const raw = await run(["git", "status", "--porcelain", "-z"]);
  if (!raw) return [];

  const files: UnstagedFile[] = [];

  // -z gives NUL-delimited entries with unquoted paths.
  // Renamed entries have an extra NUL-delimited field (the original path)
  // which we skip by consuming the next entry when we see R in index column.
  const entries = raw.split("\0");

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;

    const index = entry[0]; // index status (first char)
    const wt = entry[1]; // working-tree status (second char)
    const path = entry.slice(3);

    // Skip the extra "original path" entry for renames in the index
    if (index === "R") i++;

    if (entry[0] === "?" && entry[1] === "?") {
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
  const tmpDir = mkdtempSync(join(tmpdir(), "acai-"));
  const tmpPath = join(tmpDir, "commit-msg.txt");
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
      rmSync(tmpDir, { recursive: true });
    } catch {}
  }
}
