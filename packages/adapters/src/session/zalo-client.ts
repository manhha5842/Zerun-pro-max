import { readFile, stat } from "node:fs/promises";
import { Zalo, type ImageMetadataGetterResponse } from "zca-js";

export function createZaloClient() {
  return new Zalo({ imageMetadataGetter });
}

export async function imageMetadataGetter(filePath: string): Promise<ImageMetadataGetterResponse> {
  const [file, data] = await Promise.all([stat(filePath), readFile(filePath)]);
  const dimensions = readImageDimensions(data);
  if (!dimensions) return null;
  return { ...dimensions, size: file.size };
}

function readImageDimensions(data: Buffer): { width: number; height: number } | null {
  if (data.length < 10) return null;

  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && data.length >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }

  if (data[0] === 0xff && data[1] === 0xd8) {
    return readJpegDimensions(data);
  }

  const gifHeader = data.subarray(0, 6).toString("ascii");
  if ((gifHeader === "GIF87a" || gifHeader === "GIF89a") && data.length >= 10) {
    return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }

  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return readWebpDimensions(data);
  }

  return null;
}

function readJpegDimensions(data: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpDimensions(data: Buffer): { width: number; height: number } | null {
  const type = data.subarray(12, 16).toString("ascii");
  if (type === "VP8 " && data.length >= 30) {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (type === "VP8L" && data.length >= 25) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (type === "VP8X" && data.length >= 30) {
    return {
      width: 1 + data.readUIntLE(24, 3),
      height: 1 + data.readUIntLE(27, 3)
    };
  }
  return null;
}
