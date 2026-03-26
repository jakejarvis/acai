import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "./args";

describe("parseConfig", () => {
  const origArgv = process.argv;
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Reset to bare node invocation (no CLI args)
    process.argv = ["node", "acai"];
    delete process.env.ACAI_PROVIDER;
    delete process.env.ACAI_MODEL;
  });

  afterEach(() => {
    process.argv = origArgv;
    process.env = origEnv;
  });

  it("returns defaults when no args or env vars", () => {
    const config = parseConfig();
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("");
    expect(config.yolo).toBe(false);
    expect(config.verbose).toBe(false);
    expect(config.version).toBe(false);
    expect(config.help).toBe(false);
  });

  it("parses --provider flag", () => {
    process.argv = ["node", "acai", "--provider", "codex"];
    expect(parseConfig().provider).toBe("codex");
  });

  it("parses -p shorthand", () => {
    process.argv = ["node", "acai", "-p", "codex"];
    expect(parseConfig().provider).toBe("codex");
  });

  it("parses --codex shorthand alias", () => {
    process.argv = ["node", "acai", "--codex"];
    expect(parseConfig().provider).toBe("codex");
  });

  it("parses --claude shorthand alias", () => {
    process.argv = ["node", "acai", "--claude"];
    expect(parseConfig().provider).toBe("claude");
  });

  it("--provider takes priority over shorthand alias", () => {
    process.argv = ["node", "acai", "--codex", "--provider", "claude"];
    expect(parseConfig().provider).toBe("claude");
  });

  it("falls back to ACAI_PROVIDER env var", () => {
    process.env.ACAI_PROVIDER = "codex";
    expect(parseConfig().provider).toBe("codex");
  });

  it("--provider flag takes priority over env var", () => {
    process.env.ACAI_PROVIDER = "codex";
    process.argv = ["node", "acai", "-p", "claude"];
    expect(parseConfig().provider).toBe("claude");
  });

  it("parses --model flag", () => {
    process.argv = ["node", "acai", "--model", "haiku"];
    expect(parseConfig().model).toBe("haiku");
  });

  it("parses -m shorthand", () => {
    process.argv = ["node", "acai", "-m", "haiku"];
    expect(parseConfig().model).toBe("haiku");
  });

  it("falls back to ACAI_MODEL env var", () => {
    process.env.ACAI_MODEL = "opus";
    expect(parseConfig().model).toBe("opus");
  });

  it("parses --yolo / -y flag", () => {
    process.argv = ["node", "acai", "-y"];
    expect(parseConfig().yolo).toBe(true);
  });

  it("parses --verbose / -V flag", () => {
    process.argv = ["node", "acai", "-V"];
    expect(parseConfig().verbose).toBe(true);
  });

  it("parses --version / -v flag", () => {
    process.argv = ["node", "acai", "-v"];
    expect(parseConfig().version).toBe(true);
  });

  it("parses --help / -h flag", () => {
    process.argv = ["node", "acai", "-h"];
    expect(parseConfig().help).toBe(true);
  });

  it("ignores unknown flags (strict: false)", () => {
    process.argv = ["node", "acai", "--unknown-flag"];
    expect(() => parseConfig()).not.toThrow();
  });

  it("handles multiple flags together", () => {
    process.argv = ["node", "acai", "-p", "codex", "-m", "o4-mini", "-y"];
    const config = parseConfig();
    expect(config.provider).toBe("codex");
    expect(config.model).toBe("o4-mini");
    expect(config.yolo).toBe(true);
  });
});
