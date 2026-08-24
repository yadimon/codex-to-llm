import assert from "node:assert/strict";
import { startServer } from "../src/index.js";

const BLUE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdNvJ8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ2oPcf88OIhvJ6vAAAAAElFTkSuQmCC";

const server = await startServer({
  host: "127.0.0.1",
  port: 0,
  backend: "codex-exec",
  models: ["gpt-5.6-sol"],
  defaultModel: "gpt-5.6-sol"
});

try {
  const response = await fetch(`${server.url}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: `data:image/png;base64,${BLUE_PNG_BASE64}` },
            {
              type: "input_text",
              text: "Identify the solid color. Reply with exactly one lowercase English color word."
            }
          ]
        }
      ],
      max_output_tokens: 20
    })
  });
  const body = (await response.json()) as { output_text?: string; error?: { message?: string } };
  assert.equal(response.status, 200, body.error?.message || JSON.stringify(body));
  assert.match(body.output_text?.trim() || "", /^blue[.!]?$/i);
  console.log(JSON.stringify({ ok: true, output_text: body.output_text }, null, 2));
} finally {
  await server.close();
}
