const API_BASE = "";

// ── Status & mode types ─────────────────────────────────────────────────────────

export type VideoStatus    = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type GenerationMode = "video" | "image";

// ── Brand ───────────────────────────────────────────────────────────────────────

export interface Brand {
  id:               string;
  name:             string;
  style_guide:      string | null;
  reference_images: string[];
  created_at:       string;
}

// ── Video / Asset ───────────────────────────────────────────────────────────────

export interface Video {
  id:              string;
  brand_id:        string | null;
  user_prompt:     string;
  enhanced_prompt: string | null;
  status:          VideoStatus;
  video_url:       string | null;
  thumbnail_url:   string | null;
  error_message:   string | null;
  created_at:      string;
  updated_at:      string;
}

// ── Generation parameter types ──────────────────────────────────────────────────

export type VeoModel =
  | "veo-2.0-generate-001"
  | "veo-3.0-generate-preview"
  | "veo-3.1-generate-preview";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "21:9" | "4:3";
export type Quality     = "standard" | "high" | "ultra";

export type CameraMovement =
  | "static"
  | "slow_pan"
  | "dolly_in"
  | "dolly_out"
  | "crane"
  | "orbit"
  | "handheld"
  | "epic_tracking";

export type MotionStrength = "subtle" | "medium" | "dynamic" | "cinematic" | "epic";

export type LightingStyle =
  | "golden_hour"
  | "dramatic"
  | "soft_natural"
  | "studio"
  | "neon"
  | "moody_low_key";

export type VisualStyle =
  | "photorealistic"
  | "cinematic"
  | "artistic"
  | "commercial"
  | "documentary"
  | "anime";

export type ImageStyle =
  | "photorealistic"
  | "cinematic"
  | "artistic"
  | "commercial"
  | "anime"
  | "illustration"
  | "3d_render";

export interface VideoParams {
  veo_model:            VeoModel;
  duration:             5 | 8 | 10;
  aspect_ratio:         AspectRatio;
  camera_movement:      CameraMovement;
  motion_strength:      MotionStrength;
  lighting_style:       LightingStyle;
  visual_style:         VisualStyle;
  quality:              Quality;
  seed?:                number | null;
  negative_prompt?:     string | null;
  // Reference media (base64-encoded, inline)
  reference_images_b64?: string[] | null;
  start_card_b64?:       string | null;
  end_card_b64?:         string | null;
}

export interface ImageParams {
  aspect_ratio:     AspectRatio;
  style:            ImageStyle;
  quality:          Quality;
  number_of_images: 1 | 2 | 3 | 4;
  seed?:            number | null;
  negative_prompt?: string | null;
}

// ── Unified generation request ──────────────────────────────────────────────────

export interface GenerateRequest {
  brand_id:                string;
  mode:                    GenerationMode;
  user_prompt:             string;
  enhance_prompt:          boolean;
  additional_instructions?: string;
  video_params?:           VideoParams;
  image_params?:           ImageParams;
}

// ── Responses ───────────────────────────────────────────────────────────────────

export interface GenerateResponse {
  video_id:     string;
  video_ids:    string[];
  operation_id: string | null;
  status:       VideoStatus;
  message:      string;
  mode:         GenerationMode;
}

// ── Default parameter values ────────────────────────────────────────────────────

export const DEFAULT_VIDEO_PARAMS: VideoParams = {
  veo_model:       "veo-2.0-generate-001",
  duration:        8,
  aspect_ratio:    "16:9",
  camera_movement: "static",
  motion_strength: "medium",
  lighting_style:  "soft_natural",
  visual_style:    "cinematic",
  quality:         "high",
  seed:            null,
  negative_prompt: null,
  reference_images_b64: null,
  start_card_b64:  null,
  end_card_b64:    null,
};

export const DEFAULT_IMAGE_PARAMS: ImageParams = {
  aspect_ratio:     "16:9",
  style:            "photorealistic",
  quality:          "high",
  number_of_images: 1,
  seed:             null,
  negative_prompt:  null,
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Brand API ────────────────────────────────────────────────────────────────────

export async function createBrand(name: string, styleGuide?: string): Promise<Brand> {
  return apiFetch<Brand>("/api/brands", {
    method: "POST",
    body: JSON.stringify({ name, style_guide: styleGuide }),
  });
}

export async function listBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>("/api/brands");
}

export async function getBrand(id: string): Promise<Brand> {
  return apiFetch<Brand>(`/api/brands/${id}`);
}

export async function uploadBrandImages(
  brandId: string,
  files: File[],
): Promise<{ brand_id: string; reference_images: string[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${API_BASE}/api/brands/${brandId}/images`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `Upload error ${res.status}`);
  }
  return res.json();
}

// ── Generation API ───────────────────────────────────────────────────────────────

/** Unified generation endpoint — handles both video and image modes. */
export async function generateAsset(req: GenerateRequest): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** Legacy shim — delegates to generateAsset for backward compatibility. */
export async function generateVideo(
  brandId: string,
  userPrompt: string,
  additionalInstructions?: string,
): Promise<GenerateResponse> {
  return generateAsset({
    brand_id:    brandId,
    mode:        "video",
    user_prompt: userPrompt,
    enhance_prompt: true,
    additional_instructions: additionalInstructions,
    video_params: DEFAULT_VIDEO_PARAMS,
  });
}

// ── Asset retrieval ──────────────────────────────────────────────────────────────

export async function getVideo(videoId: string): Promise<Video> {
  return apiFetch<Video>(`/api/videos/${videoId}`);
}

export async function listVideos(brandId?: string, limit = 20): Promise<Video[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (brandId) params.set("brand_id", brandId);
  return apiFetch<Video[]>(`/api/videos?${params}`);
}

// ── Polling helper ───────────────────────────────────────────────────────────────

export async function pollUntilDone(
  videoId: string,
  onUpdate: (video: Video) => void,
  intervalMs = 5000,
  maxAttempts = 72, // 6 min max
): Promise<Video> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(async () => {
      try {
        const video = await getVideo(videoId);
        onUpdate(video);
        if (video.status === "COMPLETED" || video.status === "FAILED") {
          clearInterval(timer);
          resolve(video);
        } else if (++attempts >= maxAttempts) {
          clearInterval(timer);
          reject(new Error("Polling timed out after 6 minutes"));
        }
      } catch (e) {
        clearInterval(timer);
        reject(e);
      }
    }, intervalMs);
  });
}

// ── File helpers ─────────────────────────────────────────────────────────────────

/** Read a File as a base64 data string (strips the data: prefix). */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      // Strip "data:<mime>;base64," prefix — send only the raw base64 payload
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
