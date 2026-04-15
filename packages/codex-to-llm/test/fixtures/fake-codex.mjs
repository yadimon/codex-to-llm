#!/usr/bin/env node

import fs from "node:fs";

const args = process.argv.slice(2);

if (args[0] === "--version") {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}

if (args[0] !== "exec") {
  console.error(`Unsupported fake codex command: ${args.join(" ")}`);
  process.exit(1);
}

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  stdin += chunk;
});

process.stdin.on("end", () => {
  if (process.env.FAKE_CODEX_TERMINATE_SIGNAL) {
    process.kill(process.pid, process.env.FAKE_CODEX_TERMINATE_SIGNAL);
    return;
  }

  const trimmed = stdin.trim();
  const message = fs.existsSync(process.env.FAKE_CODEX_RESPONSE_FILE || "")
    ? fs.readFileSync(process.env.FAKE_CODEX_RESPONSE_FILE, "utf8").trim()
    : `FAKE:${trimmed}`;

  const events = [
    { type: "thread.started", thread_id: "fake-thread" },
    { type: "item.completed", item: { type: "agent_message", text: message } },
    {
      type: "turn.completed",
      usage: {
        input_tokens: trimmed.length,
        cached_input_tokens: 0,
        output_tokens: message.length
      }
    }
  ];

  for (const event of events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
});
