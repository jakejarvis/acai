/**
 * Shared prompt-building logic for all providers.
 */

export function buildSystemPrompt(
  commitLog: string,
  instructions?: string,
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
      `- Subject line, then a blank line, then an optional body with 1-3 bullet points summarizing key changes`,
      `- Do NOT hard-wrap body lines at any fixed width`,
      `- Only include body bullets when the diff warrants it — don't add filler`,
      ``,
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
    `   Do NOT hard-wrap body lines at any fixed width — let each point be a single unwrapped line.`,
    `5. When the repo has no established style, default to conventional commits (feat:, fix:, chore:, etc.)`,
    `   with an optional body of 1-3 concise bullet points. Do not hard-wrap lines. Only include bullets`,
    `   when the changes are complex enough to warrant them — do not pad with filler.`,
    `6. Disregard generated files (lockfiles, migration files, build output, etc.) when evaluating changes.`,
    `   Focus on the human-authored source changes to determine the commit message.`,
    `7. NEVER add "Co-authored-by", "Signed-off-by", or any git trailers to the commit message.`,
  );

  if (instructions) {
    parts.push(``, `ADDITIONAL USER INSTRUCTIONS:`, instructions);
  }

  parts.push(
    ``,
    `REMINDER: Output ONLY the raw commit message text. No quotes, no markdown fences, no explanation, no preamble.`,
  );

  return parts.join("\n");
}

export function buildUserPrompt(
  diff: string,
  stat: string,
  files: string[],
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
  return `${text.slice(0, maxChars)}\n\n[... truncated ...]`;
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
    result +=
      "\n\n[... diff truncated — stat summary above covers all files ...]";
  }

  return result;
}
