import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "tinyexec";

/**
 * Files excluded from diffs sent to the AI provider.
 * These are still listed as changed files — just their content is omitted
 * to avoid wasting tokens on generated/binary/noisy content.
 */
const DIFF_EXCLUDE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "poetry.lock",
  "uv.lock",
  "go.sum",
  "flake.lock",
  "*.pbxproj",
  "*.xcworkspacedata",
  "*.map",
];

export async function ensureGitRepo() {
  const { stdout, exitCode } = await exec("git", ["rev-parse", "--is-inside-work-tree"]);
  if (exitCode !== 0 || stdout.trim() !== "true") {
    throw new Error("Not inside a git repository.");
  }
}

export async function getStagedDiff(): Promise<string | null> {
  const excludes = DIFF_EXCLUDE_PATTERNS.map((p) => `:(exclude)${p}`);
  const { stdout, exitCode } = await exec("git", ["diff", "--cached", "--", ".", ...excludes]);
  return exitCode === 0 ? stdout.trim() : null;
}

export async function getStagedStat(): Promise<string | null> {
  const excludes = DIFF_EXCLUDE_PATTERNS.map((p) => `:(exclude)${p}`);
  const { stdout, exitCode } = await exec("git", [
    "diff",
    "--cached",
    "--stat",
    "--",
    ".",
    ...excludes,
  ]);
  return exitCode === 0 ? stdout.trim() : null;
}

export async function getStagedFiles(): Promise<string[]> {
  const { stdout, exitCode } = await exec("git", ["diff", "--cached", "--name-only"]);
  if (exitCode !== 0 || !stdout.trim()) return [];
  return stdout.trim().split("\n").filter(Boolean);
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
  const { stdout, exitCode } = await exec("git", ["status", "--porcelain", "-z"]);
  if (exitCode !== 0 || !stdout) return [];

  const files: UnstagedFile[] = [];

  // -z gives NUL-delimited entries with unquoted paths.
  // Renamed entries have an extra NUL-delimited field (the original path)
  // which we skip by consuming the next entry when we see R in index column.
  const entries = stdout.split("\0");

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
  await exec("git", ["add", "-A"], { throwOnError: true });
}

export async function stageFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await exec("git", ["add", "--", ...paths], { throwOnError: true });
}

/**
 * Get the last N non-merge commit messages (subject + body).
 */
export async function getRecentCommitLog(count = 10): Promise<string | null> {
  const { stdout, exitCode } = await exec("git", [
    "log",
    `--format=%s%n%b%n---`,
    `-n`,
    String(count),
    "--no-merges",
  ]);
  return exitCode === 0 ? stdout.trim() : null;
}

/**
 * Commit using a temp file (avoids shell escaping nightmares).
 */
export async function commit(message: string): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "acai-"));
  const tmpPath = join(tmpDir, "commit-msg.txt");
  writeFileSync(tmpPath, message, "utf-8");

  try {
    await exec("git", ["commit", "-F", tmpPath], { throwOnError: true });
  } finally {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  }
}
