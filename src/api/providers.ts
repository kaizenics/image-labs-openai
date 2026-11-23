// Picks the adapter for the configured endpoint: native Gemini for its own API host, OpenAI-compatible otherwise.
import type { EditImageParams, GenerateImageParams, VisionAnalysisParams } from "../types";
import { geminiAnalyze, geminiEditImage, geminiGenerateImage, geminiText, isGeminiNative } from "./geminiProvider";
import { editImage, generateImage } from "./openaiImages";
import { analyzeImages, enhancePrompt } from "./openaiVision";

export const generateImageAuto = (params: GenerateImageParams) =>
  isGeminiNative(params.baseUrl) ? geminiGenerateImage(params) : generateImage(params);

export const editImageAuto = (params: EditImageParams) =>
  isGeminiNative(params.baseUrl) ? geminiEditImage(params) : editImage(params);

export const analyzeImagesAuto = (params: VisionAnalysisParams) =>
  isGeminiNative(params.baseUrl) ? geminiAnalyze(params) : analyzeImages(params);

export const enhancePromptAuto = (params: Parameters<typeof enhancePrompt>[0]) =>
  isGeminiNative(params.baseUrl) ? geminiText(params) : enhancePrompt(params);
