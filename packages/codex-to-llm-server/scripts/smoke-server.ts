import { startServer } from "../src/index.js";

const started = await startServer({
  host: "127.0.0.1",
  port: 0,
  runner: {
    async runResponse() {
      return {
        id: "resp_smoke",
        model: "gpt-5.3-codex-spark",
        instructions: undefined,
        messages: [
          {
            role: "user",
            content: "Hi"
          }
        ],
        createdAt: Math.floor(Date.now() / 1000),
        content: "ok",
        usage: {
          inputTokens: 1,
          cachedInputTokens: 0,
          outputTokens: 1,
          totalTokens: 2
        },
        raw: {
          stderr: "",
          events: []
        }
      };
    },
    async *streamResponse() {
      yield { type: "response.started", response: { id: "resp_smoke", model: "gpt-5.3-codex-spark", createdAt: Math.floor(Date.now() / 1000), instructions: undefined, messages: [] } };
      yield { type: "response.output_text.delta", delta: "ok" };
      yield {
        type: "response.completed",
        response: {
          id: "resp_smoke",
          model: "gpt-5.3-codex-spark",
          instructions: undefined,
          messages: [
            {
              role: "user",
              content: "Hi"
            }
          ],
          createdAt: Math.floor(Date.now() / 1000),
          content: "ok",
          usage: {
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            totalTokens: 2
          },
          raw: {
            stderr: "",
            events: []
          }
        }
      };
    }
  }
});

console.log(started.url);
await started.close();
