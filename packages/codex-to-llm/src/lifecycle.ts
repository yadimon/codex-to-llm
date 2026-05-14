import { once } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export const TERMINATION_GRACE_MS = 2000;

export async function terminate(
  child: ChildProcessWithoutNullStreams,
  graceMs: number = TERMINATION_GRACE_MS
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const closePromise = once(child, "close");

  if (process.platform === "win32") {
    if (!child.killed) {
      child.kill();
    }
    await closePromise;
    return;
  }

  if (!child.killed) {
    child.kill("SIGTERM");
  }

  let escalation: NodeJS.Timeout | undefined;
  const escalated = new Promise<void>(resolve => {
    escalation = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore: process may have exited between check and kill
        }
      }
      resolve();
    }, graceMs);
  });

  try {
    await Promise.race([closePromise, escalated]);
    if (child.exitCode === null && child.signalCode === null) {
      await closePromise;
    }
  } finally {
    if (escalation) {
      clearTimeout(escalation);
    }
  }
}
