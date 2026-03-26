import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { providers } from "./providers";

/**
 * Resolved configuration for the CLI.
 * Add new options here — they flow through the whole app.
 */
export interface Config {
  provider: string;
  model: string;
  yolo: boolean;
  verbose: boolean;
  version: boolean;
  help: boolean;
}

const DEFAULT_PROVIDER = "claude";

const options = {
  provider: { type: "string" as const, short: "p" },
  model: { type: "string" as const, short: "m" },
  yolo: { type: "boolean" as const, short: "y" },
  verbose: { type: "boolean" as const, short: "V" },
  version: { type: "boolean" as const, short: "v" },
  help: { type: "boolean" as const, short: "h" },
  // Provider shorthand aliases (--claude, --codex)
  claude: { type: "boolean" as const },
  codex: { type: "boolean" as const },
} satisfies ParseArgsOptionsConfig;

export function parseConfig(): Config {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options,
    strict: false, // ignore unknown flags instead of throwing
  });

  // --claude / --codex shorthand aliases for --provider
  const providerAlias = values.codex ? "codex" : values.claude ? "claude" : undefined;

  return {
    provider:
      (values.provider as string | undefined) ??
      providerAlias ??
      process.env.ACAI_PROVIDER ??
      DEFAULT_PROVIDER,
    model: (values.model as string | undefined) ?? process.env.ACAI_MODEL ?? "",
    yolo: (values.yolo as boolean | undefined) ?? false,
    verbose: (values.verbose as boolean | undefined) ?? false,
    version: (values.version as boolean | undefined) ?? false,
    help: (values.help as boolean | undefined) ?? false,
  };
}

export function printUsage(): void {
  const providerNames = Object.keys(providers).join(", ");

  console.log(
    `
Usage: acai [options]

Options:
  -p, --provider <name>  AI provider to use (${providerNames}) (default: ${DEFAULT_PROVIDER})
      --claude, --codex    Shorthand for --provider <name>
                          Can also set ACAI_PROVIDER env var
  -m, --model <model>    Model to use (default: provider-specific)
                          Can also set ACAI_MODEL env var
  -y, --yolo             Stage all changes and commit without confirmation
  -V, --verbose          Print prompts sent to the provider and raw responses
  -v, --version          Show version number
  -h, --help             Show this help message

Examples:
  acai                          # use Claude with default model
  acai -p codex                 # use OpenAI Codex CLI
  acai -p codex -m o4-mini      # use Codex with specific model
  acai --model haiku            # use Claude with haiku for speed
  acai --yolo                   # skip interaction and commit all changes
`.trimStart(),
  );
}
