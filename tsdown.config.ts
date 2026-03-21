import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["bin/cli.ts"],
  nodeProtocol: "strip",
  deps: {
    onlyBundle: false,
    neverBundle: ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk"],
  },
});
