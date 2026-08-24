import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertSafeImageUrl,
  detectImageMediaType,
  isPrivateOrReservedAddress,
  normalizeImageInputs,
  normalizeImageUrl,
  parseImageDataUrl,
  prepareImageFiles
} from "../src/index.js";

const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC";

test("image normalization handles base64, HTTPS URLs, and local files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-images-test-"));
  fs.writeFileSync(path.join(tempDir, "red.png"), Buffer.from(RED_PNG_BASE64, "base64"));
  try {
    assert.deepEqual(parseImageDataUrl(`data:image/png;base64,${RED_PNG_BASE64}`), {
      type: "base64",
      mediaType: "image/png",
      data: RED_PNG_BASE64
    });
    const normalized = normalizeImageInputs(
      [
        { type: "base64", mediaType: "image/png", data: RED_PNG_BASE64 },
        { type: "url", url: "https://example.com/image.png" },
        { type: "file", path: "red.png" }
      ],
      { baseDir: tempDir }
    );
    assert.equal(normalized.length, 3);
    assert.equal(normalized[0].type, "data");
    assert.deepEqual(normalized[1], { type: "url", url: "https://example.com/image.png" });
    assert.equal(normalized[2].type, "data");
    assert.equal(detectImageMediaType(Buffer.from(RED_PNG_BASE64, "base64")), "image/png");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("prepareImageFiles materializes URL images and removes its temporary directory", async () => {
  const prepared = await prepareImageFiles(
    [{ type: "url", url: "https://example.com/red.png" }],
    { downloadUrl: async () => Buffer.from(RED_PNG_BASE64, "base64") }
  );
  const imagePath = prepared.paths[0];
  assert.equal(fs.existsSync(imagePath), true);
  assert.equal(fs.readFileSync(imagePath).toString("base64"), RED_PNG_BASE64);
  prepared.cleanup();
  assert.equal(fs.existsSync(imagePath), false);
});

test("image validation rejects malformed inputs and private-network URLs", async () => {
  assert.throws(() => normalizeImageUrl("http://example.com/image.png"), /must use https/);
  assert.throws(() => normalizeImageUrl("https://user:pass@example.com/image.png"), /credentials/);
  assert.throws(() => parseImageDataUrl("data:image/png,not-base64"), /valid base64/);
  assert.throws(
    () => parseImageDataUrl(`data:image/jpeg;base64,${RED_PNG_BASE64}`),
    /media type mismatch/
  );
  await assert.rejects(
    assertSafeImageUrl("https://image.example.test/red.png", async () => ["127.0.0.1"]),
    /Private network/
  );
  assert.equal(isPrivateOrReservedAddress("10.0.0.1"), true);
  assert.equal(isPrivateOrReservedAddress("203.1.113.10"), false);
  assert.equal(isPrivateOrReservedAddress("::1"), true);
  assert.equal(isPrivateOrReservedAddress("::ffff:169.254.169.254"), true);
  assert.equal(isPrivateOrReservedAddress("64:ff9b::a9fe:a9fe"), true);
  assert.equal(isPrivateOrReservedAddress("64:ff9b:1::a9fe:a9fe"), true);
  assert.equal(isPrivateOrReservedAddress("64:ff9b:1::808:808"), true);
  assert.equal(isPrivateOrReservedAddress("64:ff9b:0:abcd:beef:cafe:808:808"), true);
  assert.equal(isPrivateOrReservedAddress("2002:a9fe:a9fe::"), true);
  assert.equal(isPrivateOrReservedAddress("64:ff9b::808:808"), false);
  assert.equal(isPrivateOrReservedAddress("2002:808:808::"), false);
});
