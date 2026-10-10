import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeUpload, MAX_UPLOAD_BYTES, UploadTooLargeError } from "./upload";

describe("decodeUpload", () => {
  it("passes plain files through and opens gzip-compressed ones", () => {
    const text = new TextEncoder().encode("תאריך,חשבון\n01/01/2025,1000\n".repeat(1000));
    expect(decodeUpload(text)).toBe(text);
    const gz = new Uint8Array(gzipSync(text));
    expect(gz.byteLength).toBeLessThan(text.byteLength / 10);
    expect(decodeUpload(gz)).toEqual(text);
  });

  it("refuses a compressed file that expands beyond the limit", () => {
    const bomb = new Uint8Array(gzipSync(new Uint8Array(MAX_UPLOAD_BYTES + 1024)));
    expect(() => decodeUpload(bomb)).toThrow(UploadTooLargeError);
  });
});
