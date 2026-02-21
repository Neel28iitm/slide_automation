from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from models.schemas import (
    GeneratePresentationRequest,
    PresentationResponse,
    PresentationConfig,
    THEME_PRESETS,
)
from services.presentation_generator import PresentationGenerator
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

_generator = PresentationGenerator()


@router.post("/generate", response_model=PresentationResponse)
async def generate_presentation(req: GeneratePresentationRequest):
    """
    Generate a premium consulting-grade PPTX presentation.

    Priority: config > theme > default.
    Available themes: professional, creative, minimal, academic, dark.
    """
    try:
        # Resolve config: explicit config > theme preset > default
        if req.config:
            config = req.config
            theme_used = None
        elif req.theme and req.theme in THEME_PRESETS:
            config = THEME_PRESETS[req.theme]
            theme_used = req.theme
        else:
            config = PresentationConfig()
            theme_used = "professional"

        pptx_path, slides_data, used_config = await _generator.generate_presentation(
            session_id=req.session_id,
            topic=req.topic,
            num_slides=req.num_slides,
            config=config,
        )
        return PresentationResponse(
            session_id=req.session_id,
            file_path=pptx_path,
            total_slides=len(slides_data),
            theme=theme_used,
            config=used_config,
            message=f"✅ Generated {len(slides_data)} premium slides"
                    + (f" with '{theme_used}' theme" if theme_used else ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Presentation generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.get("/download/{session_id}")
async def download_presentation(session_id: str):
    """Download the most recently generated PPTX for a session."""
    folder = "generated_presentations"
    if not os.path.isdir(folder):
        raise HTTPException(status_code=404, detail="No presentations found.")

    matching = sorted(
        [f for f in os.listdir(folder) if f.startswith(f"ConsultDeck_{session_id}_")],
        reverse=True,
    )
    if not matching:
        raise HTTPException(status_code=404, detail=f"No presentation found for session {session_id}.")

    filepath = os.path.join(folder, matching[0])
    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=matching[0],
    )


@router.get("/themes")
async def list_themes():
    """List all available theme presets with their color configurations."""
    return {
        "themes": {
            name: cfg.model_dump()
            for name, cfg in THEME_PRESETS.items()
        },
        "note": "Pass a theme name in the 'theme' field when calling /generate, or use 'config' for full customisation.",
    }
