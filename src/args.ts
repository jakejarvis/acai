import { parseArgs, ParseArgsOptionsConfig } from "node:util";

/**
 * Resolved configuration for the CLI.
 * Add new options here — they flow through the whole app.
 */
export interface Config {
  model: string;
  help: boolean;
}

const DEFAULT_MODEL = "sonnet";

const options = {
  model: { type: "string" as const, short: "m" },
  help: { type: "boolean" as const, short: "h" },
} satisfies ParseArgsOptionsConfig;

export function parseConfig(): Config {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options,
    strict: false, // ignore unknown flags instead of throwing
  });

  return {
    model: values.model ?? process.env.GIT_COMMIT_AI_MODEL ?? DEFAULT_MODEL,
    help: values.help ?? false,
  };
}

export function printUsage(): void {
  console.log(`
Usage: git-commit-ai [options]

Options:
  -m, --model <model>  Claude model to use (default: ${DEFAULT_MODEL})
                        Can also set GIT_COMMIT_AI_MODEL env var
  -h, --help           Show this help message

Examples:
  git-commit-ai                  # use default model (${DEFAULT_MODEL})
  git-commit-ai --model haiku    # use haiku for speed
  git-commit-ai -m opus          # use opus for max quality
`.trimStart());
}
