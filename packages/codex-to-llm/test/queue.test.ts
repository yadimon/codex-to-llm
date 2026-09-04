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
