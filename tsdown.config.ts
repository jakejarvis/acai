import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["bin/cli.ts"],
  minify: true,
  nodeProtocol: "strip",
  inlineOnly: false,
});
