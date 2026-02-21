import { spawn } from "node:child_process";

/**
 * Run a command and return its stdout as a string.
 * Returns null if the command fails.
 */
export async function run(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<string | null> {
  const [bin, ...args] = cmd;
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      resolve(code === 0 ? stdout.trim() : null);
    });
  });
}

/**
 * Run a command, returning stdout. Throws on failure.
 */
export async function runOrThrow(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<string> {
  const result = await run(cmd, opts);
  if (result === null) {
    throw new Error(`Command failed: ${cmd.join(" ")}`);
  }
  return result;
}
