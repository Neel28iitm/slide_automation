from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from services.voice_service import transcribe_audio, synthesize_speech, save_voice_sample
from models.schemas import TTSRequest
import os

router = APIRouter()

@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en"),
):
    """Receive audio blob → return transcript text."""
    try:
        audio_bytes = await audio.read()
        text = await transcribe_audio(audio_bytes, language)
        return {"transcript": text, "language": language}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/speak")
async def speak(req: TTSRequest):
    """Convert text → MP3 audio bytes."""
    try:
        if not req.text or not req.text.strip():
             raise HTTPException(status_code=400, detail="Text cannot be empty")
             
        mp3_bytes = await synthesize_speech(req.text, req.language, req.cloned_voice_id)
        
        # Pocket TTS returns WAV, others return MP3/Edge
        media_type = "audio/wav" if req.cloned_voice_id else "audio/mpeg"
        
        return Response(
            content=mp3_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename=answer.{'wav' if req.cloned_voice_id else 'mp3'}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/clone")
async def clone_voice(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
):
    """
    Receive a sample audio blob (5-10s) and save it as a reference for cloning.
    Returns the voice_id (which is the session_id here).
    """
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) < 1000:
             raise HTTPException(status_code=400, detail="Audio sample too short")
             
        # Save to a local folder for the TTS engine to find later
        voice_id = await save_voice_sample(session_id, audio_bytes)
        
        return {
            "status": "ok",
            "voice_id": voice_id,
            "message": "Voice captured and identity cloned locally"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
