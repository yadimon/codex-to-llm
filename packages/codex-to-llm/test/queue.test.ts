import test from "node:test";
import assert from "node:assert/strict";
import { AsyncQueue } from "../src/index.js";

test("AsyncQueue surfaces a failure after draining already queued items", async () => {
  const queue = new AsyncQueue<string>();
  queue.push("first");
  queue.fail(new Error("boom"));

  const first = await queue.next();
  assert.deepEqual(first, {
    value: "first",
    done: false
  });

  await assert.rejects(queue.next(), /boom/);
});

test("AsyncQueue runs its disposer when a consumer breaks out of iteration early", async () => {
  let disposeCount = 0;
  const queue = new AsyncQueue<string>(() => {
    disposeCount += 1;
  });
  queue.push("first");
  queue.push("second");

  const seen: string[] = [];
  for await (const item of queue) {
    seen.push(item);
    break;
  }

  assert.deepEqual(seen, ["first"]);
  assert.equal(disposeCount, 1);
});

test("AsyncQueue awaits an async disposer before iteration ends", async () => {
  const order: string[] = [];
  const queue = new AsyncQueue<string>(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    order.push("disposed");
  });
  queue.push("only");

  for await (const item of queue) {
    order.push(item);
    break;
  }
  order.push("loop-exited");

  assert.deepEqual(order, ["only", "disposed", "loop-exited"]);
});

test("AsyncQueue disposes once even when return is called repeatedly", async () => {
  let disposeCount = 0;
  const queue = new AsyncQueue<string>(() => {
    disposeCount += 1;
  });

  await queue.return();
  await queue.return();

  assert.equal(disposeCount, 1);
});

test("AsyncQueue reports completion after a consumer returns early", async () => {
  const queue = new AsyncQueue<string>();
  queue.push("first");

  await queue.return();

  assert.deepEqual(await queue.next(), { value: undefined, done: true });
});

test("AsyncQueue shares one disposal across concurrent return calls", async () => {
  const order: string[] = [];
  let releaseDispose: (() => void) | undefined;
  const disposeStarted = new Promise<void>(resolve => {
    releaseDispose = resolve;
  });

  const queue = new AsyncQueue<string>(async () => {
    order.push("dispose-start");
    await new Promise(resolve => setTimeout(resolve, 20));
    order.push("dispose-end");
    releaseDispose?.();
  });

  const first = queue.return();
  const second = queue.return();
  await Promise.all([first, second, disposeStarted]);
  order.push("both-returned");

  assert.deepEqual(order, ["dispose-start", "dispose-end", "both-returned"]);
});

test("AsyncQueue stays completed when the disposer reports a failure", async () => {
  const queue: AsyncQueue<string> = new AsyncQueue<string>(() => {
    // Mirrors the runner: the disposer reports abandonment through fail().
    queue.fail(new Error("Stream closed by consumer"));
  });
  queue.push("first");

  const seen: string[] = [];
  for await (const item of queue) {
    seen.push(item);
    break;
  }

  assert.deepEqual(seen, ["first"]);
  assert.deepEqual(await queue.next(), { value: undefined, done: true });
});

test("AsyncQueue shares one disposal when the disposer throws synchronously", async () => {
  let disposeCount = 0;
  const queue = new AsyncQueue<string>(() => {
    disposeCount += 1;
    throw new Error("disposer exploded");
  });

  await assert.rejects(queue.return(), /disposer exploded/);
  await assert.rejects(queue.return(), /disposer exploded/);

  assert.equal(disposeCount, 1);
});
