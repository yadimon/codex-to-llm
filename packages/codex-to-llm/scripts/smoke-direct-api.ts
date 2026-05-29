import { DIRECT_API_RISK_ENV, runPrompt } from "../src/index.js";

if (process.env[DIRECT_API_RISK_ENV] !== "1") {
  throw new Error(`Direct API smoke requires ${DIRECT_API_RISK_ENV}=1`);
}

const model = process.env.CODEX_TO_LLM_SMOKE_MODEL || "gpt-5.3-codex-spark";
const result = await runPrompt("Say hi.", {
  directApiCall: true,
  confirmDirectApiRisk: true,
  directApiInstructions: "Answer with exactly one word.",
  model,
  reasoningEffort: "low",
  maxTokens: 8
});

if (!result.content.trim()) {
  throw new Error("Direct API smoke returned empty content");
}

console.log(
  JSON.stringify(
    {
      mode: "direct-api-call",
      model: result.model,
      content: result.content,
      usage: result.usage
    },
    null,
    2
  )
);
