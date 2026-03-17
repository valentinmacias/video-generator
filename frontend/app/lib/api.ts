const API_BASE = "";

// ── Types ──────────────────────────────────────────────────────────────────────

export type VideoStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Brand {
  id: string;
  name: string;
  style_guide: string | null;
  reference_images: string[];
  created_at: string;
}

export interface Video {
  id: string;
  brand_id: string | null;
  user_prompt: string;
  enhanced_prompt: string | null;
  status: VideoStatus;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateResponse {
  video_id: string;
  operation_id: string | null;
  status: VideoStatus;
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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

// ── Brand API ──────────────────────────────────────────────────────────────────

export async function createBrand(
  name: string,
  styleGuide?: string,
): Promise<Brand> {
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

// ── Video API ──────────────────────────────────────────────────────────────────

export async function generateVideo(
  brandId: string,
  userPrompt: string,
  additionalInstructions?: string,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/videos/generate", {
    method: "POST",
    body: JSON.stringify({
      brand_id: brandId,
      user_prompt: userPrompt,
      additional_instructions: additionalInstructions,
    }),
  });
}

export async function getVideo(videoId: string): Promise<Video> {
  return apiFetch<Video>(`/api/videos/${videoId}`);
}

export async function listVideos(brandId?: string, limit = 20): Promise<Video[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (brandId) params.set("brand_id", brandId);
  return apiFetch<Video[]>(`/api/videos?${params}`);
}

// ── Polling helper ─────────────────────────────────────────────────────────────

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
