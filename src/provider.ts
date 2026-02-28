import { spawn } from "node:child_process";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

export interface Provider {
  name: string;
  bin: string;
  versionArgs: string[];
  defaultModel: string;
  buildArgs(opts: {
    userPrompt: string;
    systemPrompt: string;
    model: string;
  }): string[];
  parseOutput(stdout: string): string;
}

const claude: Provider = {
  name: "Claude",
  bin: "claude",
  versionArgs: ["--version"],
  defaultModel: "sonnet",
  buildArgs({ userPrompt, systemPrompt, model }) {
    return [
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
    ];
  },
  parseOutput(stdout) {
    // biome-ignore lint/suspicious/noExplicitAny: response is JSON
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(
        `Failed to parse Claude response as JSON. Raw output:\n${stdout.slice(0, 500)}`,
      );
    }

    if (parsed.is_error) {
      throw new Error(`Claude error: ${parsed.result}`);
    }

    const result = (parsed.result || "").trim();
    if (!result) {
      throw new Error("Claude returned an empty commit message.");
    }

    return result;
  },
};

const codex: Provider = {
  name: "Codex",
  bin: "codex",
  versionArgs: ["--version"],
  defaultModel: "gpt-5.1-codex-mini",
  buildArgs({ userPrompt, systemPrompt, model }) {
    return [
      "exec",
      userPrompt,
      "--model",
      model,
      "-c",
      `developer_instructions=${systemPrompt}`,
      "-c",
      "model_reasoning_effort=medium",
      "--ephemeral",
      "--sandbox",
      "read-only",
    ];
  },
  parseOutput(stdout) {
    const result = stdout.trim();
    if (!result) {
      throw new Error("Codex returned an empty commit message.");
    }
    return result;
  },
};

export const providers: Record<string, Provider> = { claude, codex };

/**
 * Check that a provider's CLI binary is installed and accessible.
 */
export async function ensureProvider(provider: Provider): Promise<void> {
  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn(provider.bin, provider.versionArgs, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });

  if (!ok) {
    throw new Error(
      `${provider.name} CLI ("${provider.bin}") not found. Make sure it is installed and on your PATH.`,
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
 * Generate a commit message using the given provider's CLI.
 */
export async function generateCommitMessage(
  provider: Provider,
  opts: GenerateOpts,
): Promise<string> {
  const { diff, stat, files, commitLog, model, instructions } = opts;

  const systemPrompt = buildSystemPrompt(commitLog, instructions);
  const userPrompt = buildUserPrompt(diff, stat, files);

  const args = provider.buildArgs({ userPrompt, systemPrompt, model });

  const { stdout, stderr, code } = await new Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
  }>((resolve, reject) => {
    const proc = spawn(provider.bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
      `${provider.name} exited with code ${code}\n${stderr || stdout}`,
    );
  }

  return provider.parseOutput(stdout);
}
