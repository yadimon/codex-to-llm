import { runPrompt } from "../src/index.js";

const result = await runPrompt(
  "Hi",
  {
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "low",
    maxTokens: 32
  }
);

console.log(
  JSON.stringify(
    {
      content: result.content,
      usage: result.usage
    },
    null,
    2
  )
);
