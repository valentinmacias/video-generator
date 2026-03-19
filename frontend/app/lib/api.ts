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
  mode?:           GenerationMode;
  model_provider?: ModelProvider;
  video_url:       string | null;
  image_url?:      string | null;
  thumbnail_url:   string | null;
  error_message:   string | null;
  created_at:      string;
  updated_at:      string;
}

// ── Model provider ──────────────────────────────────────────────────────────────

export type ModelProvider = "runway" | "veo" | "kling";

// ── Runway models ───────────────────────────────────────────────────────────────

export type RunwayModel =
  | "gen4_turbo"   // Runway Gen-4 Turbo (primary, fastest)
  | "gen4_5";      // Runway Gen-4.5 (custom training, highest quality)

// ── Veo models ──────────────────────────────────────────────────────────────────

export type VeoModel =
  | "veo-2.0-generate-001"
  | "veo-3.0-generate-preview"
  | "veo-3.1-generate-preview";

// ── Shared enums ────────────────────────────────────────────────────────────────

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

// ── Runway params ───────────────────────────────────────────────────────────────

export interface RunwayParams {
  runway_model:           RunwayModel;
  duration:               5 | 10;
  aspect_ratio:           AspectRatio;
  motion_strength:        MotionStrength;
  camera_movement:        CameraMovement;
  lighting_style:         LightingStyle;
  visual_style:           VisualStyle;
  quality:                Quality;
  seed?:                  number | null;
  negative_prompt?:       string | null;
  conditioning_image_b64?: string | null;
  reference_images_b64?:  string[] | null;
}

// ── Veo params ──────────────────────────────────────────────────────────────────

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
  reference_images_b64?: string[] | null;
  start_card_b64?:       string | null;
  end_card_b64?:         string | null;
}

// ── Image params ────────────────────────────────────────────────────────────────

export interface ImageParams {
  aspect_ratio:     AspectRatio;
  style:            ImageStyle;
  quality:          Quality;
  number_of_images: 1 | 2 | 3 | 4;
  seed?:            number | null;
  negative_prompt?: string | null;
}

// ── Kling params (legacy) ───────────────────────────────────────────────────────

export interface KlingParams {
  kling_model:             string;
  duration:                5 | 10;
  aspect_ratio:            AspectRatio;
  cfg_scale:               number;
  motion_intensity:        number;
  negative_prompt?:        string | null;
  conditioning_image_b64?: string | null;
  reference_image_b64?:    string | null;
}

// ── Unified generation request ──────────────────────────────────────────────────

export interface GenerateRequest {
  brand_id:                 string | null;
  mode:                     GenerationMode;
  model_provider?:          ModelProvider;
  user_prompt:              string;
  enhance_prompt:           boolean;
  additional_instructions?: string;
  runway_params?:           RunwayParams;
  video_params?:            VideoParams;
  kling_params?:            KlingParams;
  image_params?:            ImageParams;
}

// ── Responses ───────────────────────────────────────────────────────────────────

export interface GenerateResponse {
  video_id:     string;
  video_ids:    string[];
  operation_id: string | null;
  status:       VideoStatus;
  message:      string;
  mode:         GenerationMode;
  image_url?:   string | null;
  image_urls?:  string[];
}

// ── Avatar / AI Creator types ────────────────────────────────────────────────────

export type AvatarStatus = "TRAINING" | "READY" | "FAILED";

export interface Avatar {
  id:                  string;
  name:                string;
  description?:        string | null;
  image_url?:          string | null;
  status:              AvatarStatus;
  training_progress:   number;
  model_provider:      string;
  character_id?:       string | null;
  custom_model_id?:    string | null;
  training_job_id?:    string | null;
  voice_clone_enabled: boolean;
  product_locked:      boolean;
  tags:                string[];
  gender?:             string | null;
  age?:                string | null;
  gesture?:            string | null;
  background?:         string | null;
  is_custom:           boolean;
  created_at:          string;
}

export interface TrainCreatorPayload {
  name:                string;
  description:         string;
  voice_clone_enabled: boolean;
  product_locked:      boolean;
  files:               File[];
}

export interface TrainCreatorResponse {
  avatar_id:       string;
  training_job_id: string;
  message:         string;
}

// ── Default parameter values ─────────────────────────────────────────────────────

export const DEFAULT_RUNWAY_PARAMS: RunwayParams = {
  runway_model:           "gen4_turbo",
  duration:               5,
  aspect_ratio:           "16:9",
  motion_strength:        "medium",
  camera_movement:        "static",
  lighting_style:         "soft_natural",
  visual_style:           "cinematic",
  quality:                "high",
  seed:                   null,
  negative_prompt:        null,
  conditioning_image_b64: null,
  reference_images_b64:   null,
};

export const DEFAULT_VIDEO_PARAMS: VideoParams = {
  veo_model:       "veo-3.1-generate-preview",
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

export const DEFAULT_KLING_PARAMS: KlingParams = {
  kling_model:          "kling-3.0",
  duration:             5,
  aspect_ratio:         "16:9",
  cfg_scale:            0.5,
  motion_intensity:     0.5,
  negative_prompt:      null,
  conditioning_image_b64: null,
  reference_image_b64:  null,
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

export async function generateAsset(req: GenerateRequest): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function generateVideo(
  brandId: string,
  userPrompt: string,
  additionalInstructions?: string,
): Promise<GenerateResponse> {
  return generateAsset({
    brand_id:    brandId,
    mode:        "video",
    model_provider: "runway",
    user_prompt: userPrompt,
    enhance_prompt: true,
    additional_instructions: additionalInstructions,
    runway_params: DEFAULT_RUNWAY_PARAMS,
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
  maxAttempts = 72,
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

// ── Avatar / AI Creator API ──────────────────────────────────────────────────────

export async function listAvatars(): Promise<Avatar[]> {
  return apiFetch<Avatar[]>("/api/avatars");
}

export async function getAvatarStatus(avatarId: string): Promise<Avatar> {
  return apiFetch<Avatar>(`/api/avatars/${avatarId}`);
}

export async function trainAiCreator(
  payload: TrainCreatorPayload,
): Promise<TrainCreatorResponse> {
  const form = new FormData();
  form.append("name",                payload.name);
  form.append("description",         payload.description);
  form.append("voice_clone_enabled", String(payload.voice_clone_enabled));
  form.append("product_locked",      String(payload.product_locked));
  payload.files.forEach((f) => form.append("files", f));

  const res = await fetch(`${API_BASE}/api/train-ai-creator`, {
    method: "POST",
    body:   form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `Training error ${res.status}`);
  }
  return res.json();
}

// ── File helpers ─────────────────────────────────────────────────────────────────

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Symphony Video Creator types ─────────────────────────────────────────────────

/** Result from POST /api/symphony/nano-edit */
export interface NanoEditResult {
  edited_image_url:  string | null;
  edited_image_b64:  string | null;
  nano_request_id:   string;
  original_prompt:   string;
  gcs_url:           string | null;
}

/** POST /api/symphony/generate request body */
export interface SymphonyGeneratePayload {
  edited_image_url:   string;
  /** MUST be exactly "runway" or "veo" — never silently overridden */
  model:              "runway" | "veo";
  prompt:             string;
  avatar_id?:         string | null;
  original_video_key?: string | null;
  brand_id?:          string | null;
  aspect_ratio?:      string;
  duration?:          5 | 10;
  enhance_prompt?:    boolean;
}

/** Returned by POST /api/symphony/generate */
export interface SymphonyGenerateResult {
  job_id:            string;
  status:            VideoStatus;
  message:           string;
  model_used:        string;
  estimated_seconds: number;
}

/** Returned by GET /api/symphony/status/:jobId */
export interface SymphonyJobStatus {
  job_id:             string;
  status:             VideoStatus;
  video_url:          string | null;
  nano_reference_url: string | null;
  model_used:         string | null;
  error_message:      string | null;
  progress:           number;
  created_at:         string | null;
  updated_at:         string | null;
}

// ── Symphony API functions ────────────────────────────────────────────────────────

export interface NanoEditOptions {
  avatarId?:      string;
  imageStrength?: number;   // 0.1–0.35
  guidanceScale?: number;   // 3–7
  seed?:          number | null;
}

/**
 * Step 2 of Symphony — two modes:
 *
 *   MODE A (generate): imageFiles is null / empty → prompt-only generation.
 *   MODE B (edit):     imageFiles provided → person segmentation + inpainting.
 *
 * Uses multipart/form-data — do NOT set Content-Type header manually.
 * Mode is determined server-side based on presence of source_images.
 */
export async function symphonyNanoEdit(
  imageFiles: File[] | null,
  prompt:     string,
  options:    NanoEditOptions = {},
): Promise<NanoEditResult> {
  const form = new FormData();

  // MODE B: append each image under the "source_images" field
  if (imageFiles && imageFiles.length > 0) {
    imageFiles.forEach((f) => form.append("source_images", f));
  }
  // MODE A: no images appended → backend sees empty list → generate mode

  form.append("prompt", prompt);
  if (options.avatarId)                              form.append("avatar_id",      options.avatarId);
  if (options.imageStrength !== undefined)           form.append("image_strength", String(options.imageStrength));
  if (options.guidanceScale !== undefined)           form.append("guidance_scale", String(options.guidanceScale));
  if (options.seed != null)                          form.append("seed",           String(options.seed));

  const res = await fetch(`${API_BASE}/api/symphony/nano-edit`, {
    method: "POST",
    body:   form,
    // Do NOT set Content-Type — browser sets multipart boundary automatically
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `nano-edit error ${res.status}`);
  }
  return res.json() as Promise<NanoEditResult>;
}

/**
 * Step 5 of Symphony: submit the generation request.
 * The `model` field is sent exactly as provided — Runway or Veo, never overridden.
 */
export async function symphonyGenerate(
  payload: SymphonyGeneratePayload,
): Promise<SymphonyGenerateResult> {
  return apiFetch<SymphonyGenerateResult>("/api/symphony/generate", {
    method: "POST",
    body:   JSON.stringify(payload),
  });
}

/**
 * Poll the status of a Symphony job (call every 3 seconds until COMPLETED/FAILED).
 */
export async function symphonyStatus(jobId: string): Promise<SymphonyJobStatus> {
  return apiFetch<SymphonyJobStatus>(`/api/symphony/status/${jobId}`);
}
