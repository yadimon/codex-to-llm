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

if (process.env.FAKE_CODEX_IGNORE_SIGTERM) {
  process.on("SIGTERM", () => {});
}

if (process.env.FAKE_CODEX_DUMP_ENV) {
  fs.writeFileSync(
    process.env.FAKE_CODEX_DUMP_ENV,
    JSON.stringify(process.env, null, 2),
    "utf8"
  );
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

  if (process.env.FAKE_CODEX_HANG) {
    setInterval(() => {}, 60_000);
    return;
  }

  const delay = Number(process.env.FAKE_CODEX_DELAY_MS) || 0;
  if (delay > 0) {
    setTimeout(() => emitResponse(stdin), delay);
    return;
  }

  emitResponse(stdin);
});

function emitResponse(rawStdin) {
  if (process.env.FAKE_CODEX_CAPTURE_FILE) {
    fs.writeFileSync(
      process.env.FAKE_CODEX_CAPTURE_FILE,
      JSON.stringify(
        {
          args,
          codexHome: process.env.CODEX_HOME || null
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const trimmed = rawStdin.trim();
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
}
