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
