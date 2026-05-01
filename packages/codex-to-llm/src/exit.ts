const MAX_STDERR_LENGTH = 64 * 1024;

export function appendBounded(current: string, nextChunk: string): string {
  const combined = current + nextChunk;
  if (combined.length <= MAX_STDERR_LENGTH) {
    return combined;
  }
  const tailLength = MAX_STDERR_LENGTH - "\n[stderr truncated]".length;
  return `${combined.slice(-tailLength)}\n[stderr truncated]`;
}

export function createCodexExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
  errorMessage = ""
): Error | undefined {
  const normalizedStderr = stderr.trim();
  if (signal) {
    return new Error(normalizedStderr || errorMessage || `Codex exited due to signal ${signal}`);
  }
  if (code !== 0) {
    return new Error(normalizedStderr || errorMessage || `Codex exited with code ${code}`);
  }
  return undefined;
}

export function buildAbortError(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === "string" && reason.length > 0) {
    return new Error(reason);
  }
  return new Error("Aborted by client");
}
