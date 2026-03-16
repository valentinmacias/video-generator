"""
Prompt Engineering Module
Uses Gemini 1.5 Flash to expand a simple user prompt into a
cinematic, technically-optimised prompt for Veo 3.1.
"""
import logging
from typing import List, Optional
from google import genai
from google.genai import types as genai_types
from .config import settings

logger = logging.getLogger(__name__)

_gemini_client: Optional[genai.Client] = None


def get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _gemini_client


SYSTEM_PROMPT = """You are an expert cinematographer and prompt engineer specialising in AI video generation
with Google Veo 3.1. Your task is to transform a simple user prompt into a rich, technically detailed
cinematic prompt that produces the best possible video.

When expanding a prompt you MUST:
1. Add specific camera movements (dolly, pan, tilt, crane, handheld, etc.)
2. Define lighting conditions (golden hour, studio lighting, neon, etc.)
3. Specify visual style and colour palette
4. Include motion dynamics (slow motion, time-lapse, real-time)
5. Add environment and atmosphere details
6. Maintain brand identity from the provided instructions
7. Keep the result under 350 words
8. Write the prompt in a single paragraph, present tense

Only output the enhanced prompt. No explanations, no metadata."""


async def enhance_prompt(
    user_prompt: str,
    brand_instructions: str,
    reference_images: Optional[List[str]] = None,
) -> str:
    """
    Call Gemini 1.5 Flash to expand a user prompt into a cinematic Veo prompt.
    Returns the enhanced prompt string.
    """
    client = get_gemini_client()

    brand_context = f"\n\nBrand Visual Identity:\n{brand_instructions}" if brand_instructions else ""

    if reference_images:
        refs = "\n".join(f"- {uri}" for uri in reference_images)
        brand_context += f"\n\nBrand Reference Images (maintain this visual style):\n{refs}"

    user_message = (
        f"User prompt: \"{user_prompt}\""
        f"{brand_context}"
        "\n\nExpand this into a cinematic Veo 3.1 prompt:"
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_message,
            config=genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=512,
            ),
        )
        enhanced = response.text.strip()
        logger.info(f"Enhanced prompt ({len(enhanced)} chars): {enhanced[:100]}…")
        return enhanced

    except Exception as e:
        logger.error(f"Gemini prompt enhancement failed: {e}")
        # Graceful fallback: return original prompt with basic enrichment
        return (
            f"{user_prompt}. "
            "Cinematic 16:9 composition, professional lighting, "
            "smooth camera movement, high production value, photorealistic."
        )
