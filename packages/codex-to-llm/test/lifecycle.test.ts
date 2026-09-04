import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { terminate } from "../src/lifecycle.js";

/**
 * A child that never emits "close" — the surviving-grandchild case. `pid` is
 * left undefined so escalation cannot reach a real process on any platform.
 */
function createUnresponsiveChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  Object.assign(child, {
    exitCode: null,
    signalCode: null,
    killed: false,
    pid: undefined,
    kill: () => true
  });
  return child;
}

test("terminate returns immediately when the child has already exited", async () => {
  const child = createUnresponsiveChild();
  Object.assign(child, { exitCode: 0 });

  await terminate(child, 10, 20);
});

test("terminate resolves once the child closes within the grace period", async () => {
  const child = createUnresponsiveChild();
  setTimeout(() => child.emit("close", 0, null), 5);

  await terminate(child, 1000, 2000);
});

test("terminate throws instead of hanging when the child never exits", async () => {
  const child = createUnresponsiveChild();

  await assert.rejects(
    terminate(child, 10, 30),
    /did not exit within 30ms of termination/
  );
});

test("terminate kills the child it was given", async () => {
  const child = createUnresponsiveChild();
  const killSignals: Array<NodeJS.Signals | number | undefined> = [];
  Object.assign(child, {
    kill: (signal?: NodeJS.Signals | number) => {
      killSignals.push(signal);
      return true;
    }
  });

  await assert.rejects(terminate(child, 5, 15));

  assert.equal(killSignals.length > 0, true);
});

test("terminate leaves no listeners behind after the deadline expires", async () => {
  const child = createUnresponsiveChild();

  await assert.rejects(terminate(child, 5, 15));

  const emitter = child as unknown as EventEmitter;
  assert.equal(emitter.listenerCount("close"), 0);
  assert.equal(emitter.listenerCount("error"), 0);
});

test("terminate resolves when the child reports an error instead of closing", async () => {
  const child = createUnresponsiveChild();
  setTimeout(() => child.emit("error", new Error("spawn failed")), 5);

  await terminate(child, 1000, 2000);
});

test("terminate stays within its deadline when the child never exits", async () => {
  const child = createUnresponsiveChild();
  const startedAt = Date.now();

  await assert.rejects(terminate(child, 20, 60));

  // Generous upper bound: the point is that it returns at all, bounded by the
  // deadline rather than waiting on the child forever.
  assert.equal(Date.now() - startedAt < 2000, true);
});
