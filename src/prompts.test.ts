import { describe, expect, it } from "vitest";
import { normalizeCommitMessage } from "./prompts";

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
