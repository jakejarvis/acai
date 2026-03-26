import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  normalizeCommitMessage,
  truncateDiff,
} from "./prompts";

describe("normalizeCommitMessage", () => {
  it("splits concatenated bullet points onto separate lines", () => {
    const input =
      "feat: add streaming support - stream tokens as they arrive - add native SDK providers - improve UX";
    expect(normalizeCommitMessage(input)).toBe(
      "feat: add streaming support\n\n- stream tokens as they arrive\n- add native SDK providers\n- improve UX",
    );
  });

  it("inserts blank line between subject and body when missing", () => {
    const input = "feat: add streaming\n- bullet 1\n- bullet 2";
    expect(normalizeCommitMessage(input)).toBe("feat: add streaming\n\n- bullet 1\n- bullet 2");
  });

  it("leaves already-correct messages unchanged", () => {
    const input = "feat: add streaming\n\n- bullet 1\n- bullet 2";
    expect(normalizeCommitMessage(input)).toBe(input);
  });

  it("leaves single-line messages unchanged", () => {
    const input = "chore: bump deps";
    expect(normalizeCommitMessage(input)).toBe(input);
  });

  it("does not split a single dash used as punctuation", () => {
    const input = "feat: add real-time streaming - initial implementation";
    expect(normalizeCommitMessage(input)).toBe(input);
  });

  it("handles subject with body paragraphs (no bullets)", () => {
    const input = "fix: resolve race condition\nThe mutex was not held";
    expect(normalizeCommitMessage(input)).toBe(
      "fix: resolve race condition\n\nThe mutex was not held",
    );
  });
});

describe("truncateDiff", () => {
  const makeHunk = (file: string, lines: number) => {
    const body = Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n");
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1,${lines} @@\n${body}`;
  };

  it("returns the full diff when under budget", () => {
    const diff = makeHunk("a.ts", 5);
    expect(truncateDiff(diff, 10_000)).toBe(diff);
  });

  it("truncates at file section boundaries", () => {
    const file1 = makeHunk("a.ts", 10);
    const file2 = makeHunk("b.ts", 10);
    const diff = `${file1}\n${file2}`;
    // Budget fits file1 but not both
    const result = truncateDiff(diff, file1.length + 20);
    expect(result).toContain("diff --git a/a.ts");
    expect(result).not.toContain("diff --git a/b.ts");
    expect(result).toContain("[... diff truncated");
  });

  it("keeps whole hunks within a file when partially fitting", () => {
    const hunk1 = "@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3";
    const hunk2 = "@@ -10,0 +10,3 @@\n+line4\n+line5\n+line6";
    const header = "diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n";
    const diff = `${header}${hunk1}\n${hunk2}`;
    // Budget fits header + hunk1 but not hunk2
    const budget = header.length + hunk1.length + 20;
    const result = truncateDiff(diff, budget);
    expect(result).toContain(hunk1);
    expect(result).not.toContain("line4");
    expect(result).toContain("[... diff truncated");
  });

  it("appends truncation notice when content is cut", () => {
    const diff = makeHunk("a.ts", 100);
    const result = truncateDiff(diff, 50);
    expect(result).toContain("[... diff truncated — stat summary above covers all files ...]");
  });

  it("does not append truncation notice when nothing is cut", () => {
    const diff = makeHunk("a.ts", 3);
    const result = truncateDiff(diff, 10_000);
    expect(result).not.toContain("truncated");
  });
});

describe("buildSystemPrompt", () => {
  it("includes commit history when provided", () => {
    const log = "feat: add foo\n---\nfix: bar\n---";
    const result = buildSystemPrompt(log);
    expect(result).toContain(log);
    expect(result).not.toContain("no history");
  });

  it("shows new-repo defaults when history is empty", () => {
    const result = buildSystemPrompt("");
    expect(result).toContain("no history — new repo");
    expect(result).toContain("Conventional commits format");
  });

  it("shows new-repo defaults when history is whitespace", () => {
    const result = buildSystemPrompt("   \n  ");
    expect(result).toContain("no history — new repo");
  });

  it("appends additional instructions when provided", () => {
    const result = buildSystemPrompt("feat: init\n---", "use past tense");
    expect(result).toContain("ADDITIONAL USER INSTRUCTIONS:");
    expect(result).toContain("use past tense");
  });

  it("omits additional instructions section when not provided", () => {
    const result = buildSystemPrompt("feat: init\n---");
    expect(result).not.toContain("ADDITIONAL USER INSTRUCTIONS:");
  });

  it("always includes the output-only reminder", () => {
    expect(buildSystemPrompt("")).toContain("Output ONLY the raw commit message text");
    expect(buildSystemPrompt("feat: init\n---")).toContain(
      "Output ONLY the raw commit message text",
    );
  });
});

describe("buildUserPrompt", () => {
  it("includes files, stat, and diff", () => {
    const result = buildUserPrompt("diff content", "1 file changed", ["src/foo.ts"]);
    expect(result).toContain("src/foo.ts");
    expect(result).toContain("1 file changed");
    expect(result).toContain("diff content");
  });

  it("lists multiple files", () => {
    const result = buildUserPrompt("diff", "stat", ["a.ts", "b.ts", "c.ts"]);
    expect(result).toContain("a.ts\nb.ts\nc.ts");
  });

  it("truncates large diffs without losing structure", () => {
    // Generate a diff larger than the 15k internal budget
    const bigDiff = `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -0,0 +1,1 @@\n${"+x".repeat(20_000)}`;
    const result = buildUserPrompt(bigDiff, "stat", ["big.ts"]);
    expect(result).toContain("[... diff truncated");
  });
});
