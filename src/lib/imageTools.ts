export type ToolFormat = "image/png" | "image/jpeg" | "image/webp";

export const MAX_OUTPUT_WIDTH = 4096;

/** `ratio` is width / height; null keeps the original shape. */
export const CROP_RATIOS: ReadonlyArray<{ id: string; ratio: number | null }> = [
  { id: "original", ratio: null },
  { id: "1:1", ratio: 1 },
  { id: "4:3", ratio: 4 / 3 },
  { id: "3:2", ratio: 3 / 2 },
  { id: "16:9", ratio: 16 / 9 },
  { id: "3:4", ratio: 3 / 4 },
  { id: "9:16", ratio: 9 / 16 },
];

/** Largest centered rectangle with the given aspect ratio that fits inside width x height. */
export function centerCrop(width: number, height: number, ratio: number | null) {
  if (!ratio) return { x: 0, y: 0, width, height };
  if (width / height > ratio) {
    const cropWidth = Math.round(height * ratio);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / ratio);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

export interface TransformOptions {
  ratio: number | null;
  /** Output width in px; height follows the cropped aspect ratio. */
  width: number;
  format: ToolFormat;
  /** 0-1, ignored for PNG. */
  quality: number;
}

/** Center-crop, resize and re-encode an image in the browser. */
export async function transformImage(source: Blob, options: TransformOptions) {
  const bitmap = await createImageBitmap(source);
  try {
    const crop = centerCrop(bitmap.width, bitmap.height, options.ratio);
    const width = Math.min(MAX_OUTPUT_WIDTH, Math.max(1, Math.round(options.width)));
    const height = Math.max(1, Math.round((width * crop.height) / crop.width));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");

    if (options.format === "image/jpeg") {
      // JPEG has no alpha; transparent pixels would turn black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Image encoding failed."))),
        options.format,
        options.quality,
      ),
    );
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
