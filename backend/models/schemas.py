from pydantic import BaseModel
from typing import Optional, List

# ── Ingestion ────────────────────────────────────────────────────────────────

class GitHubIngestRequest(BaseModel):
    repo_url: str                        # e.g. https://github.com/user/repo
    session_id: str
    branch: str = "main"
    include_extensions: List[str] = [
        ".py", ".ts", ".js", ".tsx", ".jsx",
        ".md", ".txt", ".json", ".yaml", ".yml",
        ".ipynb", ".sql", ".sh", ".dockerfile",
        ".env.example", ".toml", ".cfg"
    ]

class SlideIngestRequest(BaseModel):
    session_id: str
    slide_id: str
    slide_title: str
    slide_type: str
    slide_context: str                   # JSON stringified slide content
    keywords: List[str] = []

class IngestStatus(BaseModel):
    session_id: str
    status: str                          # processing | ready | error
    files_processed: int = 0
    total_files: int = 0
    chunks_created: int = 0
    message: str = ""

class SlideData(BaseModel):
    id: str
    slide_index: int
    title: str
    type: str                            # title | content | section | architecture | agenda | closing
    content: str
    notes: str = ""

class SlideUploadResponse(BaseModel):
    status: str                          # ok | error
    total_slides: int
    slides: List[SlideData]
    chunks_created: int = 0
    message: str = ""

# ── RAG ──────────────────────────────────────────────────────────────────────

class RAGQueryRequest(BaseModel):
    session_id: str
    slide_id: str                        # active slide — scopes the search
    slide_title: str
    slide_context: str                   # current slide's content summary
    question: str
    language: str = "en"                 # en | hi
    top_k: int = 5
    custom_tone: Optional[str] = None    # e.g. "Speak like a pirate", "Be very formal"

class RAGQueryResponse(BaseModel):
    answer: str
    sources: List[dict] = []
    language: str
    slide_id: str

class WebSearchRequest(BaseModel):
    query: str
    slide_context: str = ""
    language: str = "en"
    custom_tone: Optional[str] = None

# ── Voice ────────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    language: str = "en"                 # en | hi
    voice: str = "alloy"
    cloned_voice_id: Optional[str] = None # Path or ID for the local cloned voice

class VoiceSettings(BaseModel):
    stt_language: str = "en"
    tts_voice: str = "alloy"
    auto_speak: bool = True
    cloned_voice_id: Optional[str] = None

# ── Presentation ─────────────────────────────────────────────────────────────

class PresentationConfig(BaseModel):
    font_name: str = "Calibri"
    font_color: str = "#FFFFFF"          # Text on dark backgrounds
    body_font_color: str = "#333333"     # Text on light backgrounds
    background_color: str = "#FFFFFF"    # Slide body background
    header_color: str = "#003366"        # Header bar (Kearney Blue)
    accent_color: str = "#C8922A"        # Accents, bullets, lines (Kearney Gold)
    title_bg_color: str = "#003366"      # Title slide background
    font_size_title: int = 36
    font_size_heading: int = 24
    font_size_body: int = 14
    font_size_caption: int = 10

# ── Pre-built Theme Presets (inspired by GenSpark) ───────────────────────────

THEME_PRESETS: dict[str, PresentationConfig] = {
    "professional": PresentationConfig(
        font_name="Calibri",
        font_color="#FFFFFF",
        body_font_color="#2d3748",
        background_color="#FFFFFF",
        header_color="#1a365d",
        accent_color="#ed8936",
        title_bg_color="#1a365d",
    ),
    "creative": PresentationConfig(
        font_name="Calibri",
        font_color="#FFFFFF",
        body_font_color="#2d3748",
        background_color="#FFF5F5",
        header_color="#e53e3e",
        accent_color="#38a169",
        title_bg_color="#c53030",
    ),
    "minimal": PresentationConfig(
        font_name="Calibri",
        font_color="#2d3748",
        body_font_color="#2d3748",
        background_color="#f8f9fa",
        header_color="#2d3748",
        accent_color="#4299e1",
        title_bg_color="#edf2f7",
    ),
    "academic": PresentationConfig(
        font_name="Georgia",
        font_color="#FFFFFF",
        body_font_color="#2d3748",
        background_color="#FFFFFF",
        header_color="#2c5282",
        accent_color="#d69e2e",
        title_bg_color="#2c5282",
    ),
    "dark": PresentationConfig(
        font_name="Calibri",
        font_color="#FFFFFF",
        body_font_color="#e2e8f0",
        background_color="#1a202c",
        header_color="#0d1117",
        accent_color="#C8922A",
        title_bg_color="#0d1117",
    ),
}

class GeneratePresentationRequest(BaseModel):
    session_id: str
    topic: str = "Project Overview"
    num_slides: int = 10                 # 7-12 recommended
    theme: Optional[str] = None          # "professional" | "creative" | "minimal" | "academic" | "dark"
    config: Optional[PresentationConfig] = None  # Overrides theme if both provided

class PresentationResponse(BaseModel):
    session_id: str
    file_path: str
    total_slides: int
    theme: Optional[str] = None
    config: PresentationConfig
    message: str = ""

