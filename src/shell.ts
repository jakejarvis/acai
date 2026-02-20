/**
 * Run a command and return its stdout as a string.
 * Returns null if the command fails.
 */
export async function run(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<string | null> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: opts?.cwd,
    });
    const text = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return null;
    return text.trim();
  } catch {
    return null;
  }
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
