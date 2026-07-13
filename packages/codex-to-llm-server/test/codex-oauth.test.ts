import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { createCodexOauthRunner } from "../src/runners/codex-oauth.js";
import { createServer } from "../src/index.js";

function writeTempAuth(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-oauth-auth-"));
  const authPath = path.join(dir, "auth.json");
  fs.writeFileSync(authPath, JSON.stringify(body), "utf8");
  return authPath;
}

async function startFakeCodexUpstream() {
  const requests: Array<{ headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = [];
  const server = http.createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      rawBody += chunk;
    });
    request.on("end", () => {
      requests.push({
        headers: request.headers,
        body: JSON.parse(rawBody) as Record<string, unknown>
      });
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8"
      });
      response.write(
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n'
      );
      response.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_upstream","model":"gpt-5.3-codex-spark","created_at":2,"usage":{"input_tokens":7,"cached_input_tokens":3,"output_tokens":1},"output":[{"type":"message","content":[{"type":"output_text","text":"hi"}]}]}}\n\n'
      );
      response.end("data: [DONE]\n\n");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/backend-api/codex/responses`,
    requests,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
}

test("codex-oauth runner calls the Codex Responses endpoint directly", async () => {
  const authPath = writeTempAuth({
    tokens: {
      access_token: "test-access-token"
    }
  });
  const upstream = await startFakeCodexUpstream();

  try {
    const runner = createCodexOauthRunner({
      authPath,
      endpoint: upstream.url
    });

    const result = await runner.runPrompt("", {
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "high",
      maxTokens: 5,
      responsesBody: {
        model: "gpt-5.3-codex-spark",
        instructions: "Answer with one word.",
        input: "say hi",
        max_output_tokens: 5
      }
    });

    assert.equal(result.content, "hi");
    assert.equal(result.id, "resp_upstream");
    assert.equal(result.usage.inputTokens, 7);
    assert.equal(result.usage.cachedInputTokens, 3);
    assert.equal(result.usage.outputTokens, 1);
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0].headers.authorization, "Bearer test-access-token");
    assert.equal(upstream.requests[0].headers.accept, "text/event-stream");
    assert.equal(upstream.requests[0].headers.originator, "codex_cli_rs");
    assert.equal(upstream.requests[0].body.model, "gpt-5.3-codex-spark");
    assert.equal(upstream.requests[0].body.instructions, "Answer with one word.");
    assert.equal(upstream.requests[0].body.stream, true);
    assert.equal(upstream.requests[0].body.store, false);
    assert.deepEqual(upstream.requests[0].body.reasoning, { effort: "high" });
    assert.equal("max_output_tokens" in upstream.requests[0].body, false);
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("codex-oauth runner forwards multimodal image input to Codex", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();
  const imageUrl = "data:image/png;base64,iVBORw0KGgo=";

  try {
    const runner = createCodexOauthRunner({ authPath, endpoint: upstream.url });
    await runner.runPrompt("", {
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      responsesBody: {
        model: "gpt-5.6-luna",
        instructions: "Inspect the attached screenshot.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Is a consent banner visible?" },
              { type: "input_image", image_url: imageUrl }
            ]
          }
        ]
      }
    });

    const input = upstream.requests[0].body.input as Array<{
      content: Array<Record<string, string>>;
    }>;
    assert.deepEqual(input[0].content[1], {
      type: "input_image",
      image_url: imageUrl
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("codex-oauth runner forwards image detail to Codex", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();
  const imageUrl = "data:image/png;base64,iVBORw0KGgo=";

  try {
    const runner = createCodexOauthRunner({ authPath, endpoint: upstream.url });
    await runner.runPrompt("", {
      model: "gpt-5.6-luna",
      responsesBody: {
        model: "gpt-5.6-luna",
        instructions: "Inspect the attached screenshot.",
        input: [
          {
            role: "user",
            content: [{ type: "input_image", image_url: imageUrl, detail: "high" }]
          }
        ]
      }
    });

    const input = upstream.requests[0].body.input as Array<{
      content: Array<Record<string, string>>;
    }>;
    assert.deepEqual(input[0].content[0], {
      type: "input_image",
      image_url: imageUrl,
      detail: "high"
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("codex-oauth runner accepts gif image input", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();
  const imageUrl = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

  try {
    const runner = createCodexOauthRunner({ authPath, endpoint: upstream.url });
    await runner.runPrompt("", {
      model: "gpt-5.6-luna",
      responsesBody: {
        model: "gpt-5.6-luna",
        instructions: "Inspect the attached image.",
        input: [
          {
            role: "user",
            content: [{ type: "input_image", image_url: imageUrl }]
          }
        ]
      }
    });

    const input = upstream.requests[0].body.input as Array<{
      content: Array<Record<string, string>>;
    }>;
    assert.deepEqual(input[0].content[0], { type: "input_image", image_url: imageUrl });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

async function withOauthServer(
  endpoint: string,
  authPath: string,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const previousAck = process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
  const previousAuthPath = process.env.CODEX_TO_LLM_AUTH_PATH;
  process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1";
  process.env.CODEX_TO_LLM_AUTH_PATH = authPath;

  const created = createServer({
    host: "127.0.0.1",
    port: 0,
    backend: "codex-oauth",
    codexOauthEndpoint: endpoint
  });

  await new Promise<void>((resolve, reject) => {
    created.server.once("error", reject);
    created.server.listen(0, "127.0.0.1", () => {
      created.server.off("error", reject);
      resolve();
    });
  });

  try {
    const address = created.server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      created.server.close(error => (error ? reject(error) : resolve()));
    });
    if (previousAck == null) delete process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
    else process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = previousAck;
    if (previousAuthPath == null) delete process.env.CODEX_TO_LLM_AUTH_PATH;
    else process.env.CODEX_TO_LLM_AUTH_PATH = previousAuthPath;
  }
}

test("server direct mode rejects unsupported image_url with 400 before streaming", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Inspect it.",
          stream: true,
          input: [
            { role: "user", content: [{ type: "input_image", image_url: "ftp://x/y.png" }] }
          ]
        })
      });

      assert.equal(response.status, 400);
      assert.match(await response.text(), /image_url/);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects unsupported image_url with 400 for sync requests", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Inspect it.",
          input: [
            { role: "user", content: [{ type: "input_image", image_url: "" }] }
          ]
        })
      });

      assert.equal(response.status, 400);
      assert.match(await response.text(), /image_url/);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects file_id image blocks with an explicit 400", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Inspect it.",
          input: [
            { role: "user", content: [{ type: "input_image", file_id: "file-123" }] }
          ]
        })
      });

      assert.equal(response.status, 400);
      assert.match(await response.text(), /file_id/);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects a null message entry with 400", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Answer.",
          input: [null]
        })
      });

      assert.equal(response.status, 400);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects a text block with non-string text with 400", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Answer.",
          input: [{ role: "user", content: [{ type: "input_text", text: 42 }] }]
        })
      });

      assert.equal(response.status, 400);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects a bare https image_url with 400", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          instructions: "Inspect it.",
          input: [{ role: "user", content: [{ type: "input_image", image_url: "https://" }] }]
        })
      });

      assert.equal(response.status, 400);
      assert.match(await response.text(), /image_url/);
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects malformed base64 image_url with 400", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();

  try {
    await withOauthServer(upstream.url, authPath, async baseUrl => {
      for (const badUrl of ["data:image/png;base64,A", "data:image/png;base64,AAA=="]) {
        const response = await fetch(`${baseUrl}/v1/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-5.3-codex-spark",
            instructions: "Inspect it.",
            input: [{ role: "user", content: [{ type: "input_image", image_url: badUrl }] }]
          })
        });

        assert.equal(response.status, 400);
        assert.match(await response.text(), /image_url/);
      }
      assert.equal(upstream.requests.length, 0);
    });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("codex-oauth runner forwards both messages and input entries to Codex", async () => {
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  const upstream = await startFakeCodexUpstream();
  const imageUrl = "data:image/png;base64,iVBORw0KGgo=";

  try {
    const runner = createCodexOauthRunner({ authPath, endpoint: upstream.url });
    await runner.runPrompt("", {
      model: "gpt-5.6-luna",
      responsesBody: {
        model: "gpt-5.6-luna",
        instructions: "Inspect them.",
        input: {
          messages: [{ role: "user", content: "context turn" }],
          input: [{ role: "user", content: [{ type: "input_image", image_url: imageUrl }] }]
        }
      }
    });

    const input = upstream.requests[0].body.input as Array<{
      content: Array<Record<string, unknown>>;
    }>;
    assert.equal(input.length, 2);
    assert.deepEqual(input[0].content[0], { type: "input_text", text: "context turn" });
    assert.deepEqual(input[1].content[0], { type: "input_image", image_url: imageUrl });
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server selects codex-oauth backend only after risk acknowledgement", () => {
  const previousBackend = process.env.CODEX_TO_LLM_BACKEND;
  const previousAck = process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
  const previousEndpoint = process.env.CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT;
  const previousAuthPath = process.env.CODEX_TO_LLM_AUTH_PATH;
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });

  process.env.CODEX_TO_LLM_BACKEND = "codex-oauth";
  delete process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
  process.env.CODEX_TO_LLM_AUTH_PATH = authPath;
  process.env.CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT = "http://127.0.0.1:9/responses";

  try {
    assert.throws(
      () => createServer({ port: 0 }),
      /CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1/
    );

    process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1";
    const created = createServer({ port: 0 });
    created.server.close();
  } finally {
    if (previousBackend == null) delete process.env.CODEX_TO_LLM_BACKEND;
    else process.env.CODEX_TO_LLM_BACKEND = previousBackend;
    if (previousAck == null) delete process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
    else process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = previousAck;
    if (previousEndpoint == null) delete process.env.CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT;
    else process.env.CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT = previousEndpoint;
    if (previousAuthPath == null) delete process.env.CODEX_TO_LLM_AUTH_PATH;
    else process.env.CODEX_TO_LLM_AUTH_PATH = previousAuthPath;
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server rejects codex-oauth on public hosts without an API key", () => {
  const previousAck = process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
  const previousAuthPath = process.env.CODEX_TO_LLM_AUTH_PATH;
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1";
  process.env.CODEX_TO_LLM_AUTH_PATH = authPath;

  try {
    assert.throws(
      () => createServer({
        host: "0.0.0.0",
        port: 0,
        backend: "codex-oauth",
        codexOauthEndpoint: "http://127.0.0.1:9/responses"
      }),
      /requires CODEX_TO_LLM_SERVER_API_KEY/
    );

    const created = createServer({
      host: "0.0.0.0",
      port: 0,
      backend: "codex-oauth",
      apiKey: "local-server-key",
      codexOauthEndpoint: "http://127.0.0.1:9/responses"
    });
    created.server.close();
  } finally {
    if (previousAck == null) delete process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
    else process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = previousAck;
    if (previousAuthPath == null) delete process.env.CODEX_TO_LLM_AUTH_PATH;
    else process.env.CODEX_TO_LLM_AUTH_PATH = previousAuthPath;
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("server direct mode rejects missing instructions before calling upstream", async () => {
  const previousAck = process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
  const previousAuthPath = process.env.CODEX_TO_LLM_AUTH_PATH;
  const authPath = writeTempAuth({ tokens: { access_token: "test-access-token" } });
  process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1";
  process.env.CODEX_TO_LLM_AUTH_PATH = authPath;

  const created = createServer({
    host: "127.0.0.1",
    port: 0,
    backend: "codex-oauth",
    codexOauthEndpoint: "http://127.0.0.1:9/responses"
  });

  await new Promise<void>((resolve, reject) => {
    created.server.once("error", reject);
    created.server.listen(0, "127.0.0.1", () => {
      created.server.off("error", reject);
      resolve();
    });
  });

  try {
    const address = created.server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.3-codex-spark", input: "Hello" })
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /instructions/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      created.server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    if (previousAck == null) delete process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK;
    else process.env.CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = previousAck;
    if (previousAuthPath == null) delete process.env.CODEX_TO_LLM_AUTH_PATH;
    else process.env.CODEX_TO_LLM_AUTH_PATH = previousAuthPath;
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});
