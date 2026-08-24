import assert from "node:assert/strict";
import { runPrompt } from "../src/index.js";

const BLUE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdNvJ8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ2oPcf88OIhvJ6vAAAAAElFTkSuQmCC";

const result = await runPrompt(
  "Identify the solid color in the attached image. Reply with exactly one lowercase English color word.",
  {
    model: "gpt-5.6-sol",
    maxTokens: 20,
    images: [{ type: "base64", mediaType: "image/png", data: BLUE_PNG_BASE64 }]
  }
);

console.log(JSON.stringify(result, null, 2));
assert.match(result.content.trim(), /^blue[.!]?$/i, `Expected blue, received: ${result.content}`);
