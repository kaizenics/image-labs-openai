function getFileExtension(imageUrl: string, mimeType?: string): string {
  const type = mimeType || imageUrl.match(/^data:([^;,]+)/)?.[1] || "";

  if (type.includes("jpeg") || imageUrl.startsWith("data:image/jpeg")) {
    return "jpg";
  }

  if (type.includes("webp") || imageUrl.startsWith("data:image/webp")) {
    return "webp";
  }

  return "png";
}

function clickDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadImage(imageUrl: string, filenameBase: string, mimeType?: string) {
  if (imageUrl.startsWith("data:")) {
    clickDownload(imageUrl, `${filenameBase}.${getFileExtension(imageUrl, mimeType)}`);
    return;
  }

  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    clickDownload(objectUrl, `${filenameBase}.${getFileExtension(imageUrl, blob.type || mimeType)}`);
    URL.revokeObjectURL(objectUrl);
  } catch {
    clickDownload(imageUrl, `${filenameBase}.${getFileExtension(imageUrl, mimeType)}`);
  }
}

/** Copy the image itself (not its URL). Browsers only accept PNG on the clipboard, so other formats are re-encoded. */
export async function copyImage(imageUrl: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not supported in this browser.");
  }

  let blob = await (await fetch(imageUrl)).blob();
  if (blob.type !== "image/png") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("PNG encoding failed."))), "image/png"),
    );
  }

  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function downloadText(text: string, filenameBase: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  clickDownload(objectUrl, `${filenameBase}.txt`);
  URL.revokeObjectURL(objectUrl);
}

export async function copyText(text: string) {

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
