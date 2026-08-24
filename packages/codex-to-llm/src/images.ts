import { lookup } from "node:dns/promises";
import * as fs from "node:fs";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { ImageInput, ImageMediaType } from "./types.js";

export const SUPPORTED_IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
];
export const MAX_IMAGE_COUNT = 20;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;
export const MAX_IMAGE_REDIRECTS = 5;

const SUPPORTED_MEDIA_TYPES = new Set<string>(SUPPORTED_IMAGE_MEDIA_TYPES);
const IMAGE_EXTENSION: Record<ImageMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};

export type NormalizedImageInput =
  | {
      type: "data";
      mediaType: ImageMediaType;
      data: Buffer;
    }
  | {
      type: "url";
      url: string;
    };

export interface PreparedImageFiles {
  paths: string[];
  cleanup(): void;
}

export type ImageUrlDownloader = (url: string, signal?: AbortSignal) => Promise<Buffer>;

export function normalizeImageInputs(
  images: ImageInput[] | undefined,
  options: { baseDir?: string } = {}
): NormalizedImageInput[] {
  if (images == null) {
    return [];
  }
  if (!Array.isArray(images)) {
    throw new Error("Invalid images: expected an array");
  }
  if (images.length > MAX_IMAGE_COUNT) {
    throw new Error(`Too many images: maximum is ${MAX_IMAGE_COUNT}`);
  }

  let totalBytes = 0;
  return images.map((image, index) => {
    if (!image || typeof image !== "object") {
      throw new Error(`Invalid image at index ${index}: expected an object`);
    }

    if (image.type === "url") {
      return {
        type: "url",
        url: normalizeImageUrl(image.url, `image at index ${index}`)
      };
    }

    if (image.type === "base64") {
      const mediaType = normalizeImageMediaType(image.mediaType, `image at index ${index}`);
      const data = decodeBase64Image(image.data, `image at index ${index}`);
      assertImageBytes(data.length, `image at index ${index}`);
      assertDetectedMediaType(data, mediaType, `image at index ${index}`);
      totalBytes = addImageBytes(totalBytes, data.length);
      return { type: "data", mediaType, data };
    }

    if (image.type === "file") {
      if (typeof image.path !== "string" || !image.path.trim()) {
        throw new Error(`Invalid image at index ${index}: file path must not be empty`);
      }
      const filePath = path.resolve(options.baseDir || process.cwd(), image.path);
      let stats: fs.Stats;
      try {
        stats = fs.statSync(filePath);
      } catch {
        throw new Error(`Image file not found: ${filePath}`);
      }
      if (!stats.isFile()) {
        throw new Error(`Image path is not a file: ${filePath}`);
      }
      assertImageBytes(stats.size, `image file ${filePath}`);
      const data = fs.readFileSync(filePath);
      const detectedMediaType = detectImageMediaType(data);
      if (!detectedMediaType) {
        throw new Error(`Unsupported or invalid image file: ${filePath}`);
      }
      if (image.mediaType) {
        const declaredMediaType = normalizeImageMediaType(image.mediaType, `image file ${filePath}`);
        if (declaredMediaType !== detectedMediaType) {
          throw new Error(
            `Image media type mismatch for ${filePath}: declared ${declaredMediaType}, detected ${detectedMediaType}`
          );
        }
      }
      totalBytes = addImageBytes(totalBytes, data.length);
      return { type: "data", mediaType: detectedMediaType, data };
    }

    throw new Error(`Invalid image at index ${index}: unsupported image type`);
  });
}

export async function prepareImageFiles(
  images: ImageInput[] | undefined,
  options: {
    baseDir?: string;
    tempBaseDir?: string;
    signal?: AbortSignal;
    downloadUrl?: ImageUrlDownloader;
  } = {}
): Promise<PreparedImageFiles> {
  const normalized = normalizeImageInputs(images, { baseDir: options.baseDir });
  if (normalized.length === 0) {
    return { paths: [], cleanup() {} };
  }

  const tempBaseDir = options.tempBaseDir || os.tmpdir();
  fs.mkdirSync(tempBaseDir, { recursive: true });
  const imageDir = fs.mkdtempSync(path.join(tempBaseDir, ".codex-to-llm-images-"));
  const paths: string[] = [];
  let totalBytes = 0;

  try {
    for (const [index, image] of normalized.entries()) {
      assertNotAborted(options.signal);
      const data = image.type === "data"
        ? image.data
        : await (options.downloadUrl || downloadImageUrl)(image.url, options.signal);
      assertImageBytes(data.length, `image at index ${index}`);
      totalBytes = addImageBytes(totalBytes, data.length);
      const mediaType = detectImageMediaType(data);
      if (!mediaType) {
        throw new Error(`Image at index ${index} contains an unsupported or invalid image`);
      }
      if (image.type === "data" && image.mediaType !== mediaType) {
        throw new Error(
          `Image at index ${index} media type mismatch: declared ${image.mediaType}, detected ${mediaType}`
        );
      }
      const imagePath = path.join(imageDir, `image-${index + 1}.${IMAGE_EXTENSION[mediaType]}`);
      fs.writeFileSync(imagePath, data, { flag: "wx" });
      paths.push(imagePath);
    }
  } catch (error) {
    cleanupImageDirectory(imageDir);
    throw error;
  }

  return {
    paths,
    cleanup() {
      cleanupImageDirectory(imageDir);
    }
  };
}

export function createResponsesImageContent(
  prompt: string,
  images: ImageInput[] | undefined,
  options: { baseDir?: string } = {}
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = normalizeImageInputs(images, options).map(image => ({
    type: "input_image",
    image_url: image.type === "url"
      ? image.url
      : `data:${image.mediaType};base64,${image.data.toString("base64")}`
  }));
  if (prompt.trim()) {
    content.push({ type: "input_text", text: prompt });
  }
  return content;
}

export function parseImageDataUrl(value: string, label = "image_url"): ImageInput {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value.trim());
  if (!match) {
    throw new Error(`${label} must be a valid base64 image data URL`);
  }
  const mediaType = normalizeImageMediaType(match[1].toLowerCase(), label);
  const data = match[2];
  const decoded = decodeBase64Image(data, label);
  assertImageBytes(decoded.length, label);
  assertDetectedMediaType(decoded, mediaType, label);
  return { type: "base64", mediaType, data };
}

export function normalizeImageUrl(value: string, label = "image URL"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} URL must not be empty`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https`);
  }
  if (!parsed.hostname) {
    throw new Error(`${label} must include a hostname`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  return parsed.toString();
}

export function normalizeImageMediaType(value: string, label = "image"): ImageMediaType {
  if (!SUPPORTED_MEDIA_TYPES.has(value)) {
    throw new Error(
      `${label} has unsupported media type: expected image/jpeg, image/png, image/gif, or image/webp`
    );
  }
  return value as ImageMediaType;
}

export function detectImageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38 &&
    (data[4] === 0x37 || data[4] === 0x39) &&
    data[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export async function assertSafeImageUrl(
  value: string,
  resolver: HostnameResolver = resolveHostname
): Promise<URL> {
  const url = new URL(normalizeImageUrl(value));
  await resolvePublicAddresses(url.hostname, resolver);
  return url;
}

export async function downloadImageUrl(url: string, signal?: AbortSignal): Promise<Buffer> {
  let currentUrl = normalizeImageUrl(url);

  for (let redirects = 0; redirects <= MAX_IMAGE_REDIRECTS; redirects += 1) {
    assertNotAborted(signal);
    const result = await requestImage(currentUrl, signal);
    if (isRedirectStatus(result.statusCode)) {
      if (!result.location) {
        throw new Error(`Image URL redirect is missing a location: ${currentUrl}`);
      }
      if (redirects === MAX_IMAGE_REDIRECTS) {
        throw new Error(`Too many image URL redirects: ${url}`);
      }
      currentUrl = normalizeImageUrl(new URL(result.location, currentUrl).toString());
      continue;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Image URL returned HTTP ${result.statusCode}: ${currentUrl}`);
    }
    const mediaType = detectImageMediaType(result.data);
    if (!mediaType) {
      throw new Error(`Image URL returned an unsupported or invalid image: ${currentUrl}`);
    }
    if (result.contentType) {
      const declaredType = result.contentType.split(";", 1)[0].trim().toLowerCase();
      if (declaredType.startsWith("image/") && declaredType !== mediaType) {
        throw new Error(
          `Image URL media type mismatch: declared ${declaredType}, detected ${mediaType}`
        );
      }
    }
    return result.data;
  }

  throw new Error(`Too many image URL redirects: ${url}`);
}

type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

async function resolveHostname(hostname: string): Promise<string[]> {
  if (isIP(hostname)) {
    return [hostname];
  }
  return (await lookup(hostname, { all: true, verbatim: true })).map(entry => entry.address);
}

async function resolvePublicAddresses(
  hostnameValue: string,
  resolver: HostnameResolver
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const hostname = hostnameValue.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Private network image URLs are not allowed");
  }
  const addresses = [...(await resolver(hostname))];
  const records = addresses
    .map(address => ({ address, family: isIP(address) }))
    .filter((record): record is { address: string; family: 4 | 6 } =>
      record.family === 4 || record.family === 6
    );
  if (records.length === 0 || records.some(record => isPrivateOrReservedAddress(record.address))) {
    throw new Error("Private network image URLs are not allowed");
  }
  return records;
}

function requestImage(
  rawUrl: string,
  signal?: AbortSignal
): Promise<{
  statusCode: number;
  location?: string;
  contentType?: string;
  data: Buffer;
}> {
  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof https.request> | undefined;
    let settled = false;

    void (async () => {
      try {
        const url = new URL(normalizeImageUrl(rawUrl));
        const records = await resolvePublicAddresses(url.hostname, resolveHostname);
        const pinnedLookup = createPinnedLookup(records);
        assertNotAborted(signal);

        request = https.request(
          url,
          {
            method: "GET",
            headers: {
              "Accept": "image/png,image/jpeg,image/gif,image/webp",
              "User-Agent": "codex-to-llm-image-fetch/1"
            },
            lookup: pinnedLookup,
            signal
          },
          response => {
            const statusCode = response.statusCode || 0;
            const location = readHeader(response.headers.location);
            const contentType = readHeader(response.headers["content-type"]);
            const contentLength = Number(readHeader(response.headers["content-length"]) || "0");
            if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
              response.destroy(new Error(`Image URL exceeds the ${MAX_IMAGE_BYTES}-byte limit`));
              return;
            }

            const chunks: Buffer[] = [];
            let total = 0;
            response.on("data", chunkValue => {
              const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
              total += chunk.length;
              if (total > MAX_IMAGE_BYTES) {
                response.destroy(new Error(`Image URL exceeds the ${MAX_IMAGE_BYTES}-byte limit`));
                return;
              }
              chunks.push(chunk);
            });
            response.on("error", fail);
            response.on("end", () => {
              succeed({ statusCode, location, contentType, data: Buffer.concat(chunks, total) });
            });
          }
        );
        request.setTimeout(DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS, () => {
          request?.destroy(new Error(`Image download timed out after ${DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS}ms`));
        });
        request.on("error", fail);
        request.end();
      } catch (error) {
        fail(error);
      }
    })();

    function succeed(result: {
      statusCode: number;
      location?: string;
      contentType?: string;
      data: Buffer;
    }): void {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      request?.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function createPinnedLookup(records: Array<{ address: string; family: 4 | 6 }>): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily = typeof options.family === "number" ? options.family : 0;
    const matches = requestedFamily === 4 || requestedFamily === 6
      ? records.filter(record => record.family === requestedFamily)
      : records;
    const first = matches[0];
    if (!first) {
      const error = new Error("No usable public address for image URL") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }
    if (options.all) {
      callback(null, matches);
      return;
    }
    callback(null, first.address, first.family);
  };
}

export function isPrivateOrReservedAddress(addressValue: string): boolean {
  const address = addressValue.toLowerCase().split("%")[0] || addressValue.toLowerCase();
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    if (address === "::" || address === "::1") return true;
    if (address.startsWith("fc") || address.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(address) || /^fe[c-f]/.test(address)) return true;
    if (address.startsWith("ff") || address.startsWith("2001:db8:")) return true;
    const hextets = expandIpv6Address(address);
    if (
      hextets?.[0] === 0x64 &&
      hextets[1] === 0xff9b &&
      !hextets.slice(2, 6).every(value => value === 0)
    ) {
      return true;
    }
    const embedded = embeddedIpv4Address(address);
    return embedded ? isPrivateOrReservedAddress(embedded) : false;
  }
  return true;
}

function embeddedIpv4Address(address: string): string | undefined {
  const hextets = expandIpv6Address(address);
  if (!hextets) return undefined;

  const isMappedOrCompatible =
    hextets.slice(0, 5).every(value => value === 0) &&
    (hextets[5] === 0 || hextets[5] === 0xffff);
  const isNat64 =
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every(value => value === 0);
  const isSixToFour = hextets[0] === 0x2002;

  if (isSixToFour) {
    return hextetsToIpv4(hextets[1], hextets[2]);
  }
  if (isMappedOrCompatible || isNat64) {
    return hextetsToIpv4(hextets[6], hextets[7]);
  }
  return undefined;
}

function expandIpv6Address(address: string): number[] | undefined {
  if (isIP(address) !== 6) return undefined;

  let normalized = address;
  const dottedTail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
  if (dottedTail) {
    const octets = dottedTail.split(".").map(Number);
    const high = (octets[0] << 8) | octets[1];
    const low = (octets[2] << 8) | octets[3];
    normalized = normalized.slice(0, -dottedTail.length) + `${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":").map(parseHextet) : [];
  const right = halves[1] ? halves[1].split(":").map(parseHextet) : [];
  const missing = 8 - left.length - right.length;
  const hextets = halves.length === 1
    ? left
    : [...left, ...Array(Math.max(0, missing)).fill(0), ...right];
  return hextets.length === 8 && hextets.every(Number.isInteger) ? hextets : undefined;
}

function parseHextet(value: string): number {
  return Number.parseInt(value, 16);
}

function hextetsToIpv4(high: number, low: number): string {
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function decodeBase64Image(data: string, label: string): Buffer {
  if (typeof data !== "string" || !data) {
    throw new Error(`${label} base64 data must not be empty`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) {
    throw new Error(`${label} contains malformed base64 data`);
  }
  const decoded = Buffer.from(data, "base64");
  if (!decoded.length || decoded.toString("base64").replace(/=+$/, "") !== data.replace(/=+$/, "")) {
    throw new Error(`${label} contains malformed base64 data`);
  }
  return decoded;
}

function assertDetectedMediaType(data: Uint8Array, mediaType: ImageMediaType, label: string): void {
  const detectedMediaType = detectImageMediaType(data);
  if (!detectedMediaType) {
    throw new Error(`${label} contains an unsupported or invalid image`);
  }
  if (detectedMediaType !== mediaType) {
    throw new Error(
      `${label} media type mismatch: declared ${mediaType}, detected ${detectedMediaType}`
    );
  }
}

function assertImageBytes(bytes: number, label: string): void {
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`${label} exceeds the ${MAX_IMAGE_BYTES}-byte image limit`);
  }
}

function addImageBytes(current: number, bytes: number): number {
  const total = current + bytes;
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    throw new Error(`Images exceed the ${MAX_TOTAL_IMAGE_BYTES}-byte total limit`);
  }
  return total;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("Aborted by client");
}

function cleanupImageDirectory(imageDir: string): void {
  fs.rmSync(imageDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
