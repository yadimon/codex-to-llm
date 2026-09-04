import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const TERMINATION_GRACE_MS = 2000;
export const TERMINATION_DEADLINE_MS = 10000;

/**
 * Kill the child and wait until it has actually exited.
 *
 * The wait is bounded on purpose. Callers await this before removing the
 * ephemeral directories, and an abandoned stream awaits it before the
 * consumer's `for await` loop can exit — so an unbounded wait here would turn
 * a surviving grandchild into a hang in the caller's code. If the process
 * cannot be confirmed dead within `deadlineMs` this throws, and the caller
 * surfaces that alongside the original failure rather than blocking forever.
 *
 * On Windows the child is usually a `cmd.exe` shim, so killing only the
 * immediate process leaves the real CLI running and holding the workspace
 * cwd open; escalation therefore kills the whole process tree.
 */
export async function terminate(
  child: ChildProcessWithoutNullStreams,
  graceMs: number = TERMINATION_GRACE_MS,
  deadlineMs: number = TERMINATION_DEADLINE_MS
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const { pid } = child;
  const closed = once(child, "close").then(() => true as const);

  if (!child.killed) {
    child.kill();
  }

  if (await settledWithin(closed, graceMs)) {
    return;
  }

  await escalate(child, pid);

  if (await settledWithin(closed, Math.max(deadlineMs - graceMs, 0))) {
    return;
  }

  throw new Error(
    `Child process ${pid ?? "(unknown pid)"} did not exit within ${deadlineMs}ms of termination`
  );
}

async function escalate(child: ChildProcessWithoutNullStreams, pid: number | undefined): Promise<void> {
  if (process.platform !== "win32") {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore: the process may have exited between the check and the kill
    }
    return;
  }

  if (pid === undefined) {
    return;
  }

  // /T kills the whole tree, /F forces it. A non-zero exit means the tree was
  // already gone, which is the outcome we wanted anyway.
  const killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
    windowsHide: true,
    stdio: "ignore"
  });
  await once(killer, "close").catch(() => undefined);
}

async function settledWithin(closed: Promise<true>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), ms);
  });

  try {
    return await Promise.race([closed, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
