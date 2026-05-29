import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { runPrompt } from "../src/index.js";

function writeTempAuth(body: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-direct-auth-"));
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
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Salut"}\n\n'
      );
      response.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_direct","model":"gpt-5.3-codex-spark","created_at":2,"usage":{"input_tokens":9,"cached_input_tokens":1,"output_tokens":2},"output":[{"type":"message","content":[{"type":"output_text","text":"Salut"}]}]}}\n\n'
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

test("direct API call mode bypasses codex exec when explicitly confirmed", async () => {
  const authPath = writeTempAuth({
    tokens: {
      access_token: "test-access-token",
      account_id: "acct_test"
    }
  });
  const upstream = await startFakeCodexUpstream();

  try {
    const result = await runPrompt("Translate to French: Hello", {
      directApiCall: true,
      confirmDirectApiRisk: true,
      directApiEndpoint: upstream.url,
      authPath,
      cliPath: "definitely-not-used",
      model: "gpt-5.3-codex-spark",
      directApiInstructions: "Translate the input and return only the translation.",
      reasoningEffort: "low",
      maxTokens: 5
    });

    assert.equal(result.content, "Salut");
    assert.equal(result.id, "resp_direct");
    assert.equal(result.usage.inputTokens, 9);
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0].headers.authorization, "Bearer test-access-token");
    assert.equal(upstream.requests[0].headers["chatgpt-account-id"], "acct_test");
    assert.equal(upstream.requests[0].body.model, "gpt-5.3-codex-spark");
    assert.equal(
      upstream.requests[0].body.instructions,
      "Translate the input and return only the translation."
    );
    assert.equal(upstream.requests[0].body.stream, true);
    assert.equal(upstream.requests[0].body.store, false);
    assert.equal("max_output_tokens" in upstream.requests[0].body, false);
  } finally {
    await upstream.close();
    fs.rmSync(path.dirname(authPath), { recursive: true, force: true });
  }
});

test("direct API call mode requires user-supplied instructions", async () => {
  await assert.rejects(
    runPrompt("Hello", {
      directApiCall: true,
      confirmDirectApiRisk: true,
      directApiEndpoint: "http://127.0.0.1:9/responses"
    }),
    /--instructions/
  );
});

test("direct API call mode requires explicit confirmation", async () => {
  await assert.rejects(
    runPrompt("Hello", {
      directApiCall: true,
      directApiEndpoint: "http://127.0.0.1:9/responses"
    }),
    /--confirm-direct-api-risk/
  );
});
