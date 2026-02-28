import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["bin/cli.ts"],
  nodeProtocol: "strip",
  inlineOnly: false,
});
