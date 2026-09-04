import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const TERMINATION_GRACE_MS = 2000;
export const TERMINATION_DEADLINE_MS = 10000;

/**
 * Kill the child and wait until it has actually exited.
 *
 * Every phase is bounded by one absolute deadline. Callers await this before
 * removing the ephemeral directories, and an abandoned stream awaits it before
 * the consumer's `for await` loop can exit, so an unbounded wait anywhere here
 * would surface as a hang in the caller's code. When the process cannot be
 * confirmed dead within `deadlineMs` this throws instead of blocking, and the
 * caller reports that alongside the original failure.
 *
 * On Windows the child is normally a `cmd.exe` shim. Killing the shim does not
 * kill the CLI underneath it, and the shim closes almost immediately — so the
 * process-tree kill is the primary action there, not an escalation. Waiting
 * for the shim to close first would let the real process survive.
 */
export async function terminate(
  child: ChildProcessWithoutNullStreams,
  graceMs: number = TERMINATION_GRACE_MS,
  deadlineMs: number = TERMINATION_DEADLINE_MS
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const deadline = Date.now() + deadlineMs;
  const { pid } = child;
  const exited = watchExit(child);

  try {
    if (process.platform === "win32") {
      await killWindowsTree(pid, remaining(deadline));
      killDirect(child);
      if (await settledWithin(exited.promise, remaining(deadline))) {
        return;
      }
    } else {
      killDirect(child, "SIGTERM");
      if (await settledWithin(exited.promise, Math.min(graceMs, remaining(deadline)))) {
        return;
      }
      killDirect(child, "SIGKILL");
      if (await settledWithin(exited.promise, remaining(deadline))) {
        return;
      }
    }

    throw new Error(
      `Child process ${pid ?? "(unknown pid)"} did not exit within ${deadlineMs}ms of termination`
    );
  } finally {
    exited.dispose();
  }
}

/**
 * Explicit listeners rather than `once(child, "close")`: when the deadline
 * expires the promise never settles, and a `once()` helper would leave its
 * listeners attached to a child that may never emit again.
 */
function watchExit(child: ChildProcessWithoutNullStreams): {
  promise: Promise<void>;
  dispose: () => void;
} {
  let onSettled: () => void = () => undefined;
  const promise = new Promise<void>(resolve => {
    onSettled = () => resolve();
    // An "error" means the process is not going to close either.
    child.once("close", onSettled);
    child.once("error", onSettled);
  });

  return {
    promise,
    dispose: () => {
      child.removeListener("close", onSettled);
      child.removeListener("error", onSettled);
    }
  };
}

function killDirect(child: ChildProcessWithoutNullStreams, signal?: NodeJS.Signals): void {
  if (child.killed) {
    return;
  }
  try {
    child.kill(signal);
  } catch {
    // ignore: the process may have exited between the check and the kill
  }
}

async function killWindowsTree(pid: number | undefined, budgetMs: number): Promise<void> {
  if (pid === undefined) {
    return;
  }

  // /T kills the whole tree, /F forces it. A non-zero exit means the tree was
  // already gone, which is the outcome we wanted anyway.
  const killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
    windowsHide: true,
    stdio: "ignore"
  });
  const finished = new Promise<void>(resolve => {
    killer.once("close", () => resolve());
    killer.once("error", () => resolve());
  });

  if (!(await settledWithin(finished, budgetMs))) {
    // taskkill itself must not become the thing that hangs us.
    try {
      killer.kill();
    } catch {
      // ignore
    }
  }
}

function remaining(deadline: number): number {
  return Math.max(deadline - Date.now(), 0);
}

async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), ms);
  });

  try {
    return (await Promise.race([promise.then(() => true as const), timeout])) === true;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
