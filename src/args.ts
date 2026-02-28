import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { providers } from "./provider";

/**
 * Resolved configuration for the CLI.
 * Add new options here — they flow through the whole app.
 */
export interface Config {
  provider: string;
  model: string;
  help: boolean;
  yolo: boolean;
}

const DEFAULT_PROVIDER = "claude";

const options = {
  provider: { type: "string" as const, short: "p" },
  model: { type: "string" as const, short: "m" },
  yolo: { type: "boolean" as const, short: "y" },
  help: { type: "boolean" as const, short: "h" },
} satisfies ParseArgsOptionsConfig;

export function parseConfig(): Config {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options,
    strict: false, // ignore unknown flags instead of throwing
  });

  return {
    provider: (values.provider as string | undefined) ?? process.env.ACAI_PROVIDER ?? DEFAULT_PROVIDER,
    model: (values.model as string | undefined) ?? process.env.ACAI_MODEL ?? "",
    yolo: (values.yolo as boolean | undefined) ?? false,
    help: (values.help as boolean | undefined) ?? false,
  };
}

export function printUsage(): void {
  const providerNames = Object.keys(providers).join(", ");

  console.log(`
Usage: acai [options]

Options:
  -p, --provider <name>  AI provider to use (${providerNames}) (default: ${DEFAULT_PROVIDER})
                          Can also set ACAI_PROVIDER env var
  -m, --model <model>    Model to use (default: provider-specific)
                          Can also set ACAI_MODEL env var
  -y, --yolo             Stage all changes and commit without confirmation
  -h, --help             Show this help message

Examples:
  acai                          # use Claude with default model
  acai -p codex                 # use OpenAI Codex CLI
  acai -p codex -m o4-mini      # use Codex with specific model
  acai --model haiku             # use Claude with haiku for speed
  acai -m opus                   # use Claude with opus for max quality
`.trimStart());
}
