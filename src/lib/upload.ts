import { gunzipSync } from "node:zlib";

/** הגבול לקובץ אחרי פתיחת הדחיסה — מגן מפני "פצצת zip" ומגביל זיכרון בשרת */
export const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

export class UploadTooLargeError extends Error {}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

/**
 * קריאת קובץ שהועלה. הדפדפן דוחס קבצי טקסט גדולים (gzip) לפני השליחה, כי בקשה לשרת מוגבלת ל־6MB;
 * כאן פותחים את הדחיסה. קובץ שאינו דחוס מוחזר כמו שהוא.
 */
export function decodeUpload(bytes: Uint8Array): Uint8Array {
  if (!isGzip(bytes)) return bytes;
  try {
    return new Uint8Array(gunzipSync(bytes, { maxOutputLength: MAX_UPLOAD_BYTES }));
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      throw new UploadTooLargeError(`הקובץ גדול מדי (מעל ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
    }
    throw e;
  }
}

export async function readUpload(file: File): Promise<Uint8Array> {
  return decodeUpload(new Uint8Array(await file.arrayBuffer()));
}
