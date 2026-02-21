from google.cloud import speech
from google.cloud import texttospeech
from config import get_settings
import logging
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)
cfg = get_settings()

async def google_transcribe_audio(audio_bytes: bytes, language: str = "en") -> str:
    """
    Transcribe audio using Google Cloud Speech-to-Text.
    Supports Hindi (hi-IN) and English (en-US).
    Expects WEBM (Opus) audio from frontend.
    """
    try:
        # Client creation might be fast, but calling recognizing is slow
        # To be safe, we can reuse client or create inside thread
        
        def _recognize():
            client = speech.SpeechClient()
            
            # Determine language code
            lang_code = cfg.google_stt_language_code if language == "hi" else "en-US"
            
            audio = speech.RecognitionAudio(content=audio_bytes)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sample_rate_hertz=48000, # Standard for WebM
                language_code=lang_code,
                enable_automatic_punctuation=True,
            )
            return client.recognize(config=config, audio=audio)

        response = await run_in_threadpool(_recognize)
        
        if not response.results:
            return ""
            
        # Return best transcript
        return response.results[0].alternatives[0].transcript
        
    except Exception as e:
        logger.error(f"Google STT failed: {e}")
        raise

async def google_synthesize_speech(text: str, language: str = "en") -> bytes:
    """
    Synthesize speech using Google Cloud Text-to-Speech (Wavenet/Journey).
    Returns MP3 bytes.
    """
    try:
        def _synthesize():
            client = texttospeech.TextToSpeechClient()
            
            input_text = texttospeech.SynthesisInput(text=text)
            
            # Configure Voice
            lang_code = "hi-IN" if language == "hi" else "en-US"
            voice_name = "hi-IN-Neural2-A" if language == "hi" else cfg.google_tts_voice_name
            
            voice = texttospeech.VoiceSelectionParams(
                language_code=lang_code,
                name=voice_name
            )

            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )

            return client.synthesize_speech(
                input=input_text, voice=voice, audio_config=audio_config
            )

        response = await run_in_threadpool(_synthesize)

        return response.audio_content
        
    except Exception as e:
        logger.error(f"Google TTS failed: {e}")
        raise
