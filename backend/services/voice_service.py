"""
Voice pipeline:
  STT: Gemini (primary) → OpenAI Whisper (fallback)
  TTS: Google Cloud → OpenAI → Edge TTS (fallback chain)
"""
import logging
import httpx
import os
import aiofiles
from config import get_settings
from fastapi.concurrency import run_in_threadpool
import google.generativeai as genai

logger = logging.getLogger(__name__)
cfg = get_settings()

CLONED_VOICES_DIR = "cloned_voices"
os.makedirs(CLONED_VOICES_DIR, exist_ok=True)

_pocket_model = None

def get_pocket_model():
    global _pocket_model
    if _pocket_model is None:
        try:
            from pocket_tts import TTSModel
            logger.info("Loading Pocket TTS model...")
            _pocket_model = TTSModel.load_model()
        except Exception as e:
            logger.error(f"Failed to load Pocket TTS model: {e}")
            raise
    return _pocket_model

# Voice map: language → best OpenAI TTS voice
VOICE_MAP = {
    "en": "alloy",    # neutral, professional
    "hi": "nova",     # slightly warmer — works better for Hindi
}

# Import Google service conditionally
from services.voice_service_google import google_transcribe_audio, google_synthesize_speech


async def transcribe_audio(audio_bytes: bytes, language: str = "en") -> str:
    """
    Send audio bytes to STT service.
    Priority: Google Cloud → Gemini → OpenAI Whisper
    """
    logger.info(f"STT request: {len(audio_bytes)} bytes, language={language}")

    if len(audio_bytes) < 500:
        logger.warning("Audio too short, skipping STT")
        return ""

    # 1. Use Google Cloud (if configured explicitly)
    if cfg.google_cloud_project_id:
        try:
            result = await google_transcribe_audio(audio_bytes, language)
            logger.info(f"Google Cloud STT result: {result[:100]}")
            return result
        except Exception as e:
            logger.warning(f"Google Cloud STT failed: {e}")

    # 2. Use Gemini (if AI_PROVIDER is gemini) - Zero Config STT
    if cfg.ai_provider == "gemini" and cfg.gemini_api_key:
        try:
            result = await transcribe_with_gemini(audio_bytes, language)
            if result:
                logger.info(f"Gemini STT result: {result[:100]}")
                return result
        except Exception as e:
            logger.warning(f"Gemini STT failed: {e}")

    # 3. Fallback to OpenAI
    if cfg.openai_api_key:
        lang_code = "hi" if language == "hi" else "en"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {cfg.openai_api_key}"},
                    files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                    data={
                        "model": cfg.whisper_model,
                        "language": lang_code,
                        "response_format": "text",
                    },
                )
                r.raise_for_status()
                result = r.text.strip()
                logger.info(f"OpenAI Whisper STT result: {result[:100]}")
                return result
        except Exception as e:
            logger.warning(f"OpenAI Whisper STT failed: {e}")

    logger.error("All STT providers failed")
    return ""


# ── Gemini STT Implementation ────────────────────────

async def transcribe_with_gemini(audio_bytes: bytes, language: str) -> str:
    """Use Gemini multimodal to transcribe audio."""
    genai.configure(api_key=cfg.gemini_api_key)
    model_name = getattr(cfg, "gemini_flash_model", "gemini-2.0-flash")
    model = genai.GenerativeModel(model_name)

    lang_name = "Hindi" if language == "hi" else "English"
    prompt = (
        f"Transcribe the following audio exactly as spoken in {lang_name}. "
        f"Return ONLY the transcribed text, nothing else. "
        f"If there is no speech or just noise, return an empty string."
    )

    response = await run_in_threadpool(
        model.generate_content,
        [
            prompt,
            {"mime_type": "audio/webm;codecs=opus", "data": audio_bytes}
        ]
    )

    text = response.text.strip()
    # Gemini sometimes returns quotes or explanations, clean them
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    return text


async def synthesize_speech(text: str, language: str = "en", cloned_voice_id: str = None) -> bytes:
    """
    Convert text to speech via TTS service.
    Priority: Cloned Voice → Google Cloud → OpenAI → Edge TTS
    """
    logger.info(f"TTS request: {len(text)} chars, language={language}, cloned={cloned_voice_id}")

    # 0. Use Cloned Voice (Local Pocket TTS)
    if cloned_voice_id:
        try:
            return await pocket_synthesize_speech(text, cloned_voice_id)
        except Exception as e:
            logger.warning(f"Cloned voice synthesis failed: {e}")

    # 1. Use Google Cloud (if configured explicitly)
    if cfg.google_cloud_project_id:
        try:
            return await google_synthesize_speech(text, language)
        except Exception as e:
            logger.warning(f"Google Cloud TTS failed: {e}")

    # 2. Use OpenAI (if configured)
    if cfg.openai_api_key:
        voice = VOICE_MAP.get(language, "alloy")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={"Authorization": f"Bearer {cfg.openai_api_key}"},
                    json={
                        "model": cfg.tts_model,
                        "input": text,
                        "voice": voice,
                        "response_format": "mp3",
                    },
                )
                r.raise_for_status()
                return r.content
        except Exception as e:
            logger.warning(f"OpenAI TTS failed: {e}")

    # 3. Fallback to Edge TTS (Free, High Quality)
    return await edge_synthesize_speech(text, language)


# ── Edge TTS Implementation ──────────────────────────
import edge_tts

EDGE_VOICE_MAP = {
    "en": "en-US-ChristopherNeural",
    "hi": "hi-IN-SwaraNeural"
}

async def edge_synthesize_speech(text: str, language: str) -> bytes:
    voice = EDGE_VOICE_MAP.get(language, "en-US-ChristopherNeural")
    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data


async def save_voice_sample(session_id: str, audio_bytes: bytes) -> str:
    """Saves a voice sample to disk to be used as a reference."""
    filename = f"{session_id}.wav"
    filepath = os.path.join(CLONED_VOICES_DIR, filename)
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(audio_bytes)
    return filename # Use filename as the voice_id


async def pocket_synthesize_speech(text: str, voice_id: str) -> bytes:
    """Uses Pocket TTS to clone voice from reference and return WAV bytes."""
    from pocket_tts import TTSModel
    
    reference_path = os.path.join(CLONED_VOICES_DIR, voice_id)
    if not os.path.exists(reference_path):
        raise FileNotFoundError(f"Cloned voice reference not found: {reference_path}")

    # Ensure output is WAV
    import tempfile
    import wave
    import io

    def _generate():
        try:
            logger.info(f"Starting Pocket TTS synthesis for voice: {voice_id}")
            model = get_pocket_model()
            
            # 1. Get voice state from reference
            logger.info(f"Extracting voice state from: {reference_path}")
            try:
                voice_state = model.get_state_for_audio_prompt(reference_path)
                logger.info("Voice state extracted successfully")
            except Exception as e:
                err_str = str(e).lower()
                if "voice cloning" in err_str or "weight" in err_str:
                    logger.error("CRITICAL: Voice cloning weights blocked or missing. Ensure you Accepted terms at https://huggingface.co/kyutai/pocket-tts and ran 'huggingface-cli login'.")
                raise ValueError(f"Could not extract voice identity: {e}")

            # 2. Generate audio
            logger.info(f"Generating audio for text: {text[:50]}...")
            audio_tensor = model.generate_audio(voice_state, text)
            logger.info(f"Audio tensor generated: {audio_tensor.shape}")
            
            # 3. Convert torch tensor to WAV bytes
            sample_rate = model.sample_rate
            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2) # 16-bit
                wav_file.setframerate(sample_rate)
                
                # Convert float32 tensor to int16
                audio_data = (audio_tensor.clamp(-1, 1) * 32767).short().cpu().numpy()
                wav_file.writeframes(audio_data.tobytes())
                
            logger.info("WAV conversion complete")
            return buffer.getvalue()
        except Exception as ex:
            logger.error(f"Error in _generate thread: {ex}")
            raise

    return await run_in_threadpool(_generate)
