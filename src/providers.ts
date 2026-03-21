import { query } from "@anthropic-ai/claude-agent-sdk";
import { Codex } from "@openai/codex-sdk";
import { exec } from "tinyexec";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

export interface Provider {
  name: string;
  bin: string;
  versionArgs: string[];
  defaultModel: string;
  generate(opts: GenerateOpts): AsyncGenerator<string, void>;
}

export interface GenerateOpts {
  diff: string;
  stat: string;
  files: string[];
  commitLog: string;
  model: string;
  instructions?: string;
  log?: (message: string) => void;
}

const claude: Provider = {
  name: "Claude",
  bin: "claude",
  versionArgs: ["--version"],
  defaultModel: "sonnet",

  async *generate(opts) {
    const systemPrompt = buildSystemPrompt(opts.commitLog, opts.instructions);
    const userPrompt = buildUserPrompt(opts.diff, opts.stat, opts.files);
    opts.log?.(`System prompt:\n${systemPrompt}`);
    opts.log?.(`User prompt:\n${userPrompt}`);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 120_000);

    try {
      let fullText = "";

      for await (const message of query({
        prompt: userPrompt,
        options: {
          systemPrompt,
          model: opts.model,
          tools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          includePartialMessages: true,
          maxTurns: 1,
          abortController,
        },
      })) {
        // Token streaming via BetaRawMessageStreamEvent
        if (message.type === "stream_event") {
          const event = message.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            yield event.delta.text;
          }
        }

        // Fallback: extract text from completed assistant message
        if (message.type === "assistant" && !message.error) {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if ("text" in block && block.text && !fullText) {
                fullText = block.text;
                yield block.text;
              }
            }
          }
        }

        // Error on result
        if (message.type === "result" && message.is_error) {
          throw new Error(
            `Claude error: ${
              message.subtype === "success"
                ? message.result
                : message.errors?.join(", ")
            }`,
          );
        }

        // Auth/rate-limit errors
        if (message.type === "assistant" && message.error) {
          throw new Error(`Claude ${message.error} error`);
        }
      }

      if (!fullText.trim()) {
        throw new Error("Claude returned an empty commit message.");
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};

const codex: Provider = {
  name: "Codex",
  bin: "codex",
  versionArgs: ["--version"],
  defaultModel: "gpt-5.4-mini",

  async *generate(opts) {
    const systemPrompt = buildSystemPrompt(opts.commitLog, opts.instructions);
    const userPrompt = buildUserPrompt(opts.diff, opts.stat, opts.files);
    opts.log?.(`System prompt:\n${systemPrompt}`);
    opts.log?.(`User prompt:\n${userPrompt}`);

    const client = new Codex({
      config: {
        developer_instructions: systemPrompt,
        model_reasoning_effort: "medium",
        check_for_update_on_startup: false,
      },
    });

    const thread = client.startThread({
      model: opts.model,
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
    });

    const { events } = await thread.runStreamed(userPrompt);
    let lastText = "";

    for await (const event of events) {
      opts.log?.(`Event: ${JSON.stringify(event).slice(0, 300)}`);

      if (event.type === "turn.failed") {
        throw new Error(`Codex error: ${event.error.message}`);
      }

      // AgentMessageItem.text grows with each update — yield only the delta
      if (
        (event.type === "item.updated" || event.type === "item.completed") &&
        event.item.type === "agent_message"
      ) {
        const newText = event.item.text;
        if (newText.length > lastText.length) {
          yield newText.slice(lastText.length);
          lastText = newText;
        }
      }
    }

    if (!lastText.trim()) {
      throw new Error("Codex returned an empty commit message.");
    }
  },
};

export const providers: Record<string, Provider> = { claude, codex };

/**
 * Check that a provider's CLI binary is installed and accessible.
 */
export async function ensureProvider(provider: Provider): Promise<void> {
  const { exitCode } = await exec(provider.bin, provider.versionArgs, {
    nodeOptions: { stdio: ["ignore", "pipe", "pipe"] },
  });
  if (exitCode !== 0) {
    throw new Error(
      `${provider.name} CLI ("${provider.bin}") not found. Make sure it is installed and on your PATH.`,
    );
  }
}
