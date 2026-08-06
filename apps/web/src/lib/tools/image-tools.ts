import { Type, type Static } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { invoke } from "@tauri-apps/api/core";
import type { ToolDefinitionV2 } from "./categories";
import { isTauri, getAppDataDir } from "@/lib/storage";
import { appFetch } from "@/lib/http";
import { useSettingsStore } from "@/stores/settings-store";

// ============================================================================
// Parameter Schemas
// ============================================================================

export const GenerateImageParams = Type.Object({
  prompt: Type.String({ description: "Detailed description of the image to generate" }),
  source_image: Type.Optional(
    Type.String({
      description:
        "Path to an existing image to edit or vary (e.g., the 'Saved to' path from a previous generate_image result)",
    })
  ),
  aspect_ratio: Type.Optional(
    StringEnum(["1:1", "16:9", "9:16", "4:3", "3:4"] as const, {
      description: "Aspect ratio of the generated image (default: model default)",
    })
  ),
});

// ============================================================================
// OpenRouter Image API types
// ============================================================================

interface ImageApiResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number };
  error?: { message?: string };
}

const IMAGES_API_URL = "https://openrouter.ai/api/v1/images";
const GENERATION_TIMEOUT_MS = 120_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// ============================================================================
// Tool Implementation
// ============================================================================

/** Build a filesystem-safe filename slug from the prompt. */
function promptSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "image";
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as ImageApiResponse;
    if (body.error?.message) return `HTTP ${resp.status}: ${body.error.message}`;
  } catch {
    // not JSON
  }
  return `HTTP ${resp.status}`;
}

async function buildInputReference(sourceImage: string): Promise<{
  type: "image_url";
  image_url: { url: string };
}> {
  const extension = sourceImage.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXTENSION[extension] ?? "image/png";
  const base64 = await invoke<string>("read_file_base64", { path: sourceImage });
  return { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } };
}

export async function executeGenerateImage(
  args: Static<typeof GenerateImageParams>
): Promise<string> {
  const { prompt, source_image, aspect_ratio } = args;

  if (!isTauri()) {
    throw new Error("Image generation is only available in the desktop app");
  }

  const { apiKeys, imageModel, availableImageModels } = useSettingsStore.getState();
  const apiKey = apiKeys.openrouter.trim();
  if (!apiKey) {
    throw new Error("No OpenRouter API key configured. Add one in Settings → API Keys.");
  }
  if (!imageModel) {
    throw new Error("No image model selected. Configure an Image Model in Settings → Models.");
  }

  let inputReferences: Awaited<ReturnType<typeof buildInputReference>>[] | undefined;
  if (source_image) {
    const known = availableImageModels.find((m) => m.id === imageModel);
    if (known && !known.supportsImageInput) {
      throw new Error(
        `The selected image model "${imageModel}" does not support image editing. ` +
          `Choose a different Image Model in Settings → Models.`
      );
    }
    inputReferences = [await buildInputReference(source_image)];
  }

  const resp = await appFetch(IMAGES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      output_format: "png",
      ...(aspect_ratio ? { aspect_ratio } : {}),
      ...(inputReferences ? { input_references: inputReferences } : {}),
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`Image generation failed (${await readErrorMessage(resp)})`);
  }

  const result = (await resp.json()) as ImageApiResponse;
  const image = result.data?.[0];
  if (!image?.b64_json) {
    throw new Error("Image generation failed: the API returned no image data");
  }

  const extension = EXTENSION_BY_MEDIA_TYPE[image.media_type ?? "image/png"] ?? "png";
  const path = `${await getAppDataDir()}/images/${timestamp()}-${promptSlug(prompt)}.${extension}`;
  await invoke("write_file_base64", { path, dataBase64: image.b64_json });

  const lines = [
    source_image ? "Image edited successfully." : "Image generated successfully.",
    `Model: ${imageModel}`,
    `Saved to: ${path}`,
  ];
  if (typeof result.usage?.cost === "number") {
    lines.push(`Cost: $${result.usage.cost.toFixed(4)}`);
  }
  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const IMAGE_TOOL_DEFINITIONS: Record<string, ToolDefinitionV2> = {
  generate_image: {
    name: "generate_image",
    description:
      "Generate an image from a text prompt (or edit an existing image when source_image is provided) using the configured OpenRouter image model. The image is saved locally and displayed in chat automatically.",
    category: "web",
    riskLevel: "low",
    parameters: GenerateImageParams,
    requiresNetwork: true,
    supportsUndo: false,
    estimatedDurationMs: 30000,
  },
};
