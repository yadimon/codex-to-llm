import test from "node:test";
import assert from "node:assert/strict";
import type { RunOptions, StreamEvent } from "@yadimon/codex-to-llm";
import {
  buildOpenAIResponse,
  startServer
} from "../src/index.js";

function createStubRunner(calls: Array<{ prompt: string; options: RunOptions }> = []) {
  return {
    async runPrompt(prompt: string, options: RunOptions = {}) {
      calls.push({ prompt, options });
      return {
        id: "resp_stub",
        model: options.model || "gpt-5.3-codex-spark",
        prompt,
        createdAt: 1,
        content: "hello world",
        usage: {
          inputTokens: 11,
          cachedInputTokens: 0,
          outputTokens: 3,
          totalTokens: 14
        },
        raw: {
          stderr: "",
          events: []
        }
      };
    },
    async *streamPrompt(prompt: string, options: RunOptions = {}): AsyncGenerator<StreamEvent> {
      calls.push({ prompt, options });
      yield {
        type: "response.started",
        response: {
          id: "resp_stream",
          model: options.model || "gpt-5.3-codex-spark",
          prompt,
          createdAt: 1
        }
      };
      yield {
        type: "response.output_text.delta",
        delta: "hello world"
      };
      yield {
        type: "response.completed",
        response: {
          id: "resp_stream",
          model: options.model || "gpt-5.3-codex-spark",
          prompt,
          createdAt: 1,
          content: "hello world",
          usage: {
            inputTokens: 11,
            cachedInputTokens: 0,
            outputTokens: 3,
            totalTokens: 14
          },
          raw: {
            stderr: "",
            events: []
          }
        }
      };
    }
  };
}

test("buildOpenAIResponse maps core results into response objects", () => {
  const response = buildOpenAIResponse({
    id: "resp_1",
    createdAt: 1,
    model: "gpt-5.3-codex-spark",
    prompt: "Hello",
    content: "hello world",
    usage: {
      inputTokens: 11,
      cachedInputTokens: 0,
      outputTokens: 3,
      totalTokens: 14
    },
    raw: {
      stderr: "",
      events: []
    }
  });

  assert.equal(response.object, "response");
  assert.equal(response.output_text, "hello world");
  assert.equal(response.usage.total_tokens, 14);
});

test("server exposes health, models, and sync responses", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    runner: createStubRunner()
  });

  try {
    const health = await fetch(`${started.url}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const models = await fetch(`${started.url}/v1/models`);
    const modelsJson = (await models.json()) as { data: Array<{ id: string }> };
    assert.equal(modelsJson.data[0].id, "gpt-5.3-codex-spark");

    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.3-codex-spark",
        input: "Hello"
      })
    });
    const responseJson = (await response.json()) as { object: string; output_text: string };

    assert.equal(response.status, 200);
    assert.equal(responseJson.object, "response");
    assert.equal(responseJson.output_text, "hello world");
  } finally {
    await started.close();
  }
});

test("server streams SSE responses", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    runner: createStubRunner()
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stream: true,
        input: "Hello"
      })
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: response.created/);
    assert.match(text, /event: response.output_text.delta/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    await started.close();
  }
});

test("server leaves health and models public when bearer auth is configured", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    apiKey: "secret",
    runner: createStubRunner()
  });

  try {
    assert.equal((await fetch(`${started.url}/healthz`)).status, 200);
    assert.equal((await fetch(`${started.url}/v1/models`)).status, 200);
  } finally {
    await started.close();
  }
});

test("server rejects unsupported fields and enforces bearer auth on responses only", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    apiKey: "secret",
    runner: createStubRunner()
  });

  try {
    const unauthorized = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: "Hello"
      })
    });
    assert.equal(unauthorized.status, 401);

    const unsupported = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret"
      },
      body: JSON.stringify({
        input: "Hello",
        tools: [{}]
      })
    });
    assert.equal(unsupported.status, 400);
  } finally {
    await started.close();
  }
});

test("server forwards max_output_tokens and reasoning effort to the runner", async () => {
  const calls: Array<{ prompt: string; options: RunOptions }> = [];
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    runner: createStubRunner(calls)
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.3-codex-spark",
        input: "Hello",
        max_output_tokens: 500,
        reasoning: {
          effort: "high"
        }
      })
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.maxTokens, 500);
    assert.equal(calls[0].options.reasoningEffort, "high");
    assert.match(calls[0].prompt, /## Conversation/);
  } finally {
    await started.close();
  }
});

test("server rejects invalid reasoning effort with 400", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    runner: createStubRunner()
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.3-codex-spark",
        input: "Hello",
        reasoning: {
          effort: "extreme"
        }
      })
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid reasoning\.effort/);
  } finally {
    await started.close();
  }
});

test("server rejects invalid max_output_tokens with 400", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    runner: createStubRunner()
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.3-codex-spark",
        input: "Hello",
        max_output_tokens: -100
      })
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid max_output_tokens/);
  } finally {
    await started.close();
  }
});

test("server rejects models outside the configured list", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    runner: createStubRunner()
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "bad-model",
        input: "Hello"
      })
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /Unsupported model/);
  } finally {
    await started.close();
  }
});

test("server does not send DONE after a streaming failure", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    runner: {
      async runPrompt() {
        throw new Error("not used");
      },
      async *streamPrompt(): AsyncGenerator<StreamEvent> {
        yield {
          type: "response.started",
          response: {
            id: "resp_stream",
            model: "gpt-5.3-codex-spark",
            prompt: "Hello",
            createdAt: 1
          }
        };
        throw new Error("stream failed");
      }
    }
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stream: true,
        input: "Hello"
      })
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: response.failed/);
    assert.doesNotMatch(text, /data: \[DONE\]/);
  } finally {
    await started.close();
  }
});

test("server reports a failed SSE stream when no completed response arrives", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    runner: {
      async runPrompt() {
        throw new Error("not used");
      },
      async *streamPrompt(): AsyncGenerator<StreamEvent> {
        yield {
          type: "response.started",
          response: {
            id: "resp_stream",
            model: "gpt-5.3-codex-spark",
            prompt: "Hello",
            createdAt: 1
          }
        };
        yield {
          type: "response.output_text.delta",
          delta: "partial"
        };
      }
    }
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stream: true,
        input: "Hello"
      })
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: response.failed/);
    assert.match(text, /Runner stream ended without a completed response/);
    assert.doesNotMatch(text, /data: \[DONE\]/);
  } finally {
    await started.close();
  }
});


test("server rejects oversized request bodies", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    runner: createStubRunner()
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: "x".repeat(10 * 1024 * 1024 + 1)
      })
    });

    assert.equal(response.status, 413);
    assert.match(await response.text(), /Request body too large/);
  } finally {
    await started.close();
  }
});

test("mock-mode SSE emits response.created before any content event", async () => {
  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    models: ["gpt-5.3-codex-spark"],
    mockMode: true
  });

  try {
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stream: true,
        model: "gpt-5.3-codex-spark",
        input: "Hello"
      })
    });
    const text = await response.text();
    const createdIdx = text.indexOf("event: response.created");
    const deltaIdx = text.indexOf("event: response.output_text.delta");
    const completedIdx = text.indexOf("event: response.completed");

    assert.equal(response.status, 200);
    assert.notEqual(createdIdx, -1);
    assert.notEqual(deltaIdx, -1);
    assert.notEqual(completedIdx, -1);
    assert.ok(createdIdx < deltaIdx);
    assert.ok(deltaIdx < completedIdx);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    await started.close();
  }
});

test("SSE: client disconnect aborts the runner stream", async () => {
  let observedSignal: AbortSignal | undefined;
  const aborts: string[] = [];

  const stub = {
    async runPrompt() {
      throw new Error("not used");
    },
    async *streamPrompt(_: string, opts: RunOptions = {}): AsyncGenerator<StreamEvent> {
      observedSignal = opts.signal;
      yield {
        type: "response.started",
        response: {
          id: "resp_abort",
          model: "gpt-5.3-codex-spark",
          prompt: "Hello",
          createdAt: 1
        }
      };
      yield { type: "response.output_text.delta", delta: "first" };
      await new Promise<void>((_, reject) => {
        opts.signal?.addEventListener("abort", () => {
          aborts.push("aborted");
          reject(new Error("aborted"));
        });
      });
    }
  };

  const started = await startServer({
    host: "127.0.0.1",
    port: 0,
    runner: stub
  });

  try {
    const controller = new AbortController();
    const responsePromise = fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream: true, input: "Hello" }),
      signal: controller.signal
    });
    const response = await responsePromise;
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    try {
      await reader.cancel();
    } catch {
      // expected
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(aborts.length, 1, "runner should observe abort");
    assert.ok(observedSignal, "stub should receive an AbortSignal");
    assert.equal(observedSignal!.aborted, true);
  } finally {
    await started.close();
  }
});

test("startServer rejects invalid configured ports before listen", async () => {
  await assert.rejects(
    startServer({
      host: "127.0.0.1",
      port: Number.NaN,
      runner: createStubRunner()
    }),
    /Invalid server port/
  );
});
