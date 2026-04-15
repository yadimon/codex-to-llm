import test from "node:test";
import assert from "node:assert/strict";
import type { ConversationInput, RunOptions, StreamEvent } from "@yadimon/codex-to-llm";
import {
  buildOpenAIResponse,
  startServer
} from "../src/index.js";

function createStubRunner(calls: Array<{ input: ConversationInput; options: RunOptions }> = []) {
  return {
    async runResponse(input: ConversationInput, options: RunOptions = {}) {
      calls.push({ input, options });
      return {
        id: "resp_stub",
        model: options.model || "gpt-5.3-codex-spark",
        instructions: typeof input === "object" && input && !Array.isArray(input) ? input.instructions : undefined,
        messages: [
          {
            role: "user" as const,
            content:
              typeof input === "object" &&
              input &&
              !Array.isArray(input) &&
              typeof input.input === "string"
                ? input.input
                : "hello"
          }
        ],
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
    async *streamResponse(input: ConversationInput, options: RunOptions = {}): AsyncGenerator<StreamEvent> {
      calls.push({ input, options });
      yield {
        type: "response.started",
        response: {
          id: "resp_stream",
          model: options.model || "gpt-5.3-codex-spark",
          instructions: typeof input === "object" && input && !Array.isArray(input) ? input.instructions : undefined,
          messages: [],
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
          instructions: typeof input === "object" && input && !Array.isArray(input) ? input.instructions : undefined,
          messages: [
            {
              role: "user",
              content:
                typeof input === "object" &&
                input &&
                !Array.isArray(input) &&
                typeof input.input === "string"
                  ? input.input
                  : "hello"
            }
          ],
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
    instructions: undefined,
    messages: [],
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
  const calls: Array<{ input: ConversationInput; options: RunOptions }> = [];
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
      async runResponse() {
        throw new Error("not used");
      },
      async *streamResponse(): AsyncGenerator<StreamEvent> {
        yield {
          type: "response.started",
          response: {
            id: "resp_stream",
            model: "gpt-5.3-codex-spark",
            instructions: undefined,
            messages: [],
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
