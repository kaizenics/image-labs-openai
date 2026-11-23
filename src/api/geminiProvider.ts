// Native Google Gemini adapter (generateContent). Chosen automatically when the base URL is the Gemini API host;
// the OpenAI-compatible endpoint of the same host (/v1beta/openai) keeps using the OpenAI adapters.
import type {
  EditImageParams,
  GenerateImageParams,
  GenerateImageResult,
  ImageTaskDebug,
  VisionAnalysisParams,
  VisionAnalysisResult,
} from "../types";
import { ImageGenerationError } from "./openaiImages";
import { VisionAnalysisError } from "./openaiVision";
import { joinBaseUrl, stripInternalParams } from "./requestShaping";

const MAX_DEBUG_STRING_LENGTH = 1_000;
const TRAILING_AR = /\s*--(?:ar|aspect(?:-ratio)?)\s+\d+\s*[:/]\s*\d+\s*$/i;

export function isGeminiNative(baseUrl: string) {
  try {
    const url = new URL(baseUrl.trim());
    return url.host === "generativelanguage.googleapis.com" && !url.pathname.includes("/openai");
  } catch {
    return false;
  }
}

/** Truncates long strings (base64 image data) so debug info stays small and safe to persist. */
function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_DEBUG_STRING_LENGTH
      ? `${value.slice(0, MAX_DEBUG_STRING_LENGTH)}… [${value.length} chars]`
      : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redact(nested)]));
  }
  return value;
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

const imageParts = (images: File[]) =>
  Promise.all(images.map(async (file) => ({ inlineData: { mimeType: file.type || "image/png", data: await toBase64(file) } })));

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

type ErrorClass = new (message: string, debug: ImageTaskDebug) => Error;

async function callGemini(
  call: {
    apiKey: string;
    baseUrl: string;
    model: string;
    parts: unknown[];
    generationConfig?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    signal?: AbortSignal;
  },
  Failure: ErrorClass,
) {
  const { apiKey, baseUrl, model, parts, generationConfig, extra = {}, signal } = call;
  if (!apiKey.trim()) throw new Error("API Key is required.");
  if (!baseUrl.trim()) throw new Error("API Base URL is required.");
  if (!model.trim()) throw new Error("Model is required.");

  const { generationConfig: extraConfig, ...extraRest } = extra;
  const mergedConfig = { ...generationConfig, ...(extraConfig && typeof extraConfig === "object" ? extraConfig : {}) };
  const body = {
    contents: [{ role: "user", parts }],
    ...extraRest,
    ...(Object.keys(mergedConfig).length ? { generationConfig: mergedConfig } : {}),
  };
  const endpoint = joinBaseUrl(baseUrl, `/models/${encodeURIComponent(model.trim())}:generateContent`);
  const debug: ImageTaskDebug = { endpoint, requestBody: redact(body) as Record<string, unknown> };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });

  const text = await res.text().catch(() => "");
  let parsed: GeminiResponse | undefined;
  try {
    parsed = text.trim() ? (JSON.parse(text) as GeminiResponse) : undefined;
  } catch {
    parsed = undefined;
  }
  debug.responseStatus = res.status;
  debug.responseStatusText = res.statusText;
  debug.responseContentType = res.headers.get("content-type");
  debug.responseBodyText = redact(text) as string;
  debug.parsedResponse = redact(parsed);

  if (!res.ok) throw new Failure(parsed?.error?.message || text || `Request failed with status ${res.status}`, debug);
  if (!parsed) throw new Failure("Invalid or empty JSON response.", debug);
  return { parsed, debug };
}

const partsOf = (response: GeminiResponse) => response.candidates?.[0]?.content?.parts ?? [];
const textOf = (response: GeminiResponse) =>
  partsOf(response)
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

function takeParam(extra: Record<string, unknown>, keys: string[]) {
  let found: unknown;
  for (const key of keys) {
    if (key in extra) found ??= extra[key];
    delete extra[key];
  }
  return typeof found === "string" && found ? found : undefined;
}

async function generate(params: GenerateImageParams, images: File[]): Promise<GenerateImageResult> {
  const { apiKey, baseUrl, model, prompt, extraParams = {}, signal } = params;
  if (!prompt.trim()) throw new Error("Prompt is required.");

  // The app derives aspect_ratio / image_size from the size picker for Gemini models; they go in imageConfig here.
  const extra = stripInternalParams(extraParams);
  const aspectRatio = takeParam(extra, ["aspect_ratio", "aspectRatio"]);
  const imageSize = takeParam(extra, ["image_size", "imageSize"]);
  delete extra.append_prompt_ar;

  const { parsed, debug } = await callGemini(
    {
      apiKey,
      baseUrl,
      model,
      parts: [{ text: prompt.replace(TRAILING_AR, "").trim() }, ...(await imageParts(images))],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(aspectRatio || imageSize ? { imageConfig: { ...(aspectRatio && { aspectRatio }), ...(imageSize && { imageSize }) } } : {}),
      },
      extra,
      signal,
    },
    ImageGenerationError,
  );

  for (const part of partsOf(parsed)) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (data) {
      const mime = (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png";
      return { imageUrl: `data:${mime};base64,${data}`, b64Json: data, raw: debug.parsedResponse, debug };
    }
  }

  const reason = parsed.promptFeedback?.blockReason ?? parsed.candidates?.[0]?.finishReason;
  const note = textOf(parsed);
  throw new ImageGenerationError(`No image returned${reason ? ` (${reason})` : ""}${note ? `: ${note}` : ""}`, debug);
}

export const geminiGenerateImage = (params: GenerateImageParams) => generate(params, []);

/** The mask is not supported by Gemini image editing and is ignored. */
export const geminiEditImage = (params: EditImageParams) => generate(params, params.images);

export async function geminiAnalyze(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
  const { apiKey, baseUrl, model, prompt, images, extraParams = {}, signal } = params;
  if (!prompt.trim()) throw new Error("OCR prompt is required.");
  if (!images.length) throw new Error("At least one image is required for OCR.");

  const { parsed, debug } = await callGemini(
    {
      apiKey,
      baseUrl,
      model,
      parts: [{ text: prompt.trim() }, ...(await imageParts(images))],
      extra: stripInternalParams(extraParams),
      signal,
    },
    VisionAnalysisError,
  );

  const outputText = textOf(parsed);
  if (!outputText) throw new VisionAnalysisError("No text output returned.", debug);
  return { outputText, raw: debug.parsedResponse, debug };
}

/** Text-only call, used by the prompt enhancer. */
export async function geminiText(params: { apiKey: string; baseUrl: string; model: string; prompt: string; signal?: AbortSignal }) {
  const { prompt, ...rest } = params;
  if (!prompt.trim()) throw new Error("Prompt is required.");
  const { parsed, debug } = await callGemini({ ...rest, parts: [{ text: prompt.trim() }] }, VisionAnalysisError);
  const text = textOf(parsed);
  if (!text) throw new VisionAnalysisError("No text output returned.", debug);
  return text;
}

/** Gemini's list uses `models/<id>` names and a different shape from the OpenAI list. */
export async function fetchGeminiModels(apiKey: string, baseUrl: string, signal?: AbortSignal) {
  const res = await fetch(joinBaseUrl(baseUrl, "/models?pageSize=1000"), { headers: { "x-goog-api-key": apiKey }, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to fetch models (status ${res.status}).`);
  }
  const json = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
  return (json.models ?? []).flatMap((item) =>
    item.name && item.supportedGenerationMethods?.includes("generateContent") ? [item.name.replace(/^models\//, "")] : [],
  );
}
