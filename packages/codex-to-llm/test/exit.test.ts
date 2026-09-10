import test from "node:test";
import assert from "node:assert/strict";
import { buildAbortError, withFailureContext } from "../src/exit.js";

test("termination and cleanup failures preserve a default abort reason without mutating it", () => {
  const controller = new AbortController();
  controller.abort();
  const original = buildAbortError(controller.signal);
  const message = original.message;
  const termination = withFailureContext(original, "termination", new Error("deadline exceeded"));
  const cleanup = withFailureContext(termination, "cleanup", "access denied");
  assert.equal(original.message, message);
  assert.equal(original.name, "AbortError");
  assert.equal(termination.cause, original);
  assert.equal(cleanup.cause, termination);
  assert.equal(cleanup.message, `${message} (termination failed: deadline exceeded) (cleanup failed: access denied)`);
});

test("failure context supports frozen caller errors", () => {
  const original = Object.freeze(new Error("caller cancellation"));
  const result = withFailureContext(original, "cleanup", new Error("disk failure"));
  assert.equal(result.cause, original);
  assert.equal(result.message, "caller cancellation (cleanup failed: disk failure)");
  assert.equal(original.message, "caller cancellation");
});
