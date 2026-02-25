import { spawn } from "node:child_process";

/**
 * Check that `claude` CLI is installed and accessible.
 */
export async function ensureClaude(): Promise<void> {
  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn("claude", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });

  if (!ok) {
    throw new Error(
      [
        "Claude Code not found. Install it using:",
        "",
        "    curl -fsSL https://claude.ai/install.sh | bash",
        "",
      ].join("\n")
    );
  }
}

interface GenerateOpts {
  diff: string;
  stat: string;
  files: string[];
  commitLog: string;
  model: string;
  instructions?: string;
}

/**
 * Generate a commit message by calling `claude -p` in headless mode.
 *
 * We pass the repo's recent commit log alongside the diff so Claude can
 * infer the style/format/conventions on its own — no manual parsing needed.
 */
export async function generateCommitMessage(
  opts: GenerateOpts
): Promise<string> {
  const { diff, stat, files, commitLog, model, instructions } = opts;

  const systemPrompt = buildSystemPrompt(commitLog, instructions);
  const userPrompt = buildUserPrompt(diff, stat, files);

  const { stdout, stderr, code } = await new Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
  }>((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        userPrompt,
        "--output-format",
        "json",
        "--model",
        model,
        "--tools",
        "",
        "--no-session-persistence",
        "--system-prompt",
        systemPrompt,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
  });

  if (code !== 0) {
    throw new Error(
      `Claude exited with code ${code}\n${stderr || stdout}`
    );
  }

  try {
    const parsed = JSON.parse(stdout);
    if (parsed.is_error) {
      throw new Error(`Claude error: ${parsed.result}`);
    }
    return (parsed.result || "").trim();
  } catch (e) {
    // If it's our own error, rethrow
    if (e instanceof Error && e.message.startsWith("Claude error:")) throw e;
    // Otherwise JSON parse failed — use raw output
    return stdout.trim();
  }
}

function buildSystemPrompt(
  commitLog: string,
  instructions?: string
): string {
  const truncatedLog = truncate(commitLog, 10_000);
  const hasHistory = Boolean(commitLog.trim());

  const parts = [
    `You are a git commit message generator. Your ONLY output is a commit message — nothing else.`,
    ``,
    `RECENT COMMIT HISTORY FROM THIS REPO:`,
    `\`\`\``,
    hasHistory ? truncatedLog : "(no history — new repo)",
    `\`\`\``,
    ``,
  ];

  if (!hasHistory) {
    parts.push(
      `Since this is a new repo with no commit history, use this default style:`,
      `- Conventional commits format (feat:, fix:, chore:, docs:, refactor:, etc.)`,
      `- Imperative mood, lowercase after prefix`,
      `- Subject line followed by an optional body with 1-3 bullet points summarizing key changes`,
      `- Only include body bullets when the diff warrants it — don't add filler`,
      ``
    );
  }

  parts.push(
    `INSTRUCTIONS:`,
    `1. Study the commit history above carefully. Notice the format, conventions, tone, and style.`,
    `   - Do they use conventional commits (feat:, fix:, etc.)?`,
    `   - Gitmoji? Ticket prefixes? Brackets?`,
    `   - Imperative mood or past tense?`,
    `   - Capitalized or lowercase?`,
    `   - Subject-only, or subject + body?`,
    `   - What level of detail?`,
    `2. Generate a commit message for the staged changes that **matches the repo's existing style exactly**.`,
    `3. Do NOT invent issue/ticket numbers unless they appear in the diff.`,
    `4. If the style uses a subject + body format, separate them with a blank line.`,
    `   Wrap body lines at 72 characters.`,
    `5. When the repo has no established style, default to conventional commits (feat:, fix:, chore:, etc.)`,
    `   with an optional body of 1-3 concise bullet points. Only include bullets when the changes are`,
    `   complex enough to warrant them — do not pad with filler.`,
    `6. NEVER add "Co-authored-by", "Signed-off-by", or any git trailers to the commit message.`,
  );

  if (instructions) {
    parts.push(
      ``,
      `ADDITIONAL USER INSTRUCTIONS:`,
      instructions
    );
  }

  parts.push(
    ``,
    `REMINDER: Output ONLY the raw commit message text. No quotes, no markdown fences, no explanation, no preamble.`
  );

  return parts.join("\n");
}

function buildUserPrompt(
  diff: string,
  stat: string,
  files: string[]
): string {
  const truncatedDiff = truncateDiff(diff, 15_000);

  return [
    `Generate a commit message for these staged changes:`,
    ``,
    `Files changed:`,
    files.join("\n"),
    ``,
    `Diff stat:`,
    stat,
    ``,
    `Full diff:`,
    truncatedDiff,
  ].join("\n");
}

/**
 * Truncate plain text to a character limit.
 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... truncated ...]";
}

/**
 * Truncate a unified diff at hunk boundaries so we don't cut mid-hunk.
 * Keeps whole hunks (starting with @@ or diff --git) until the budget
 * is exhausted, then appends a note about the omitted remainder.
 */
function truncateDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;

  // Split into hunks/file sections at "diff --git" boundaries
  const sections = diff.split(/(?=^diff --git )/m);
  let result = "";

  for (const section of sections) {
    if (result.length + section.length > maxChars) {
      // Try to include partial file by keeping whole hunks within it
      const hunks = section.split(/(?=^@@ )/m);
      for (const hunk of hunks) {
        if (result.length + hunk.length > maxChars) break;
        result += hunk;
      }
      break;
    }
    result += section;
  }

  if (result.length < diff.length) {
    result += "\n\n[... diff truncated — stat summary above covers all files ...]";
  }

  return result;
}
