from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # AI Provider
    ai_provider: str = "gemini"          # gemini | openai | anthropic | ollama
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    gemini_api_key: str = ""
    gemini_embedding_model: str = "gemini-embedding-001"
    
    # Specific Gemini Models (User Requested)
    # Content Extraction & Voice Q&A (Low latency)
    gemini_flash_model: str = "gemini-2.5-flash"
    # Structure & Reasoning (High quality)
    gemini_pro_model: str = "gemini-2.5-pro"
    # Default model for general queries
    gemini_model: str = "gemini-2.5-flash"
    
    # Google Cloud (STT/TTS)
    google_cloud_project_id: str = ""    # Required for Cloud Speech/TTS
    google_stt_language_code: str = "hi-IN" # Default for Hindi support
    google_tts_voice_name: str = "en-IN-Wavenet-D" # Example natural voice
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # GitHub
    github_token: str = ""               # Optional: for private repos

    # ChromaDB
    chroma_persist_dir: str = "./chroma_db"
    chroma_collection: str = "consultdeck"

    # Voice
    whisper_model: str = "whisper-1"     # OpenAI Whisper
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"             # alloy | echo | fable | onyx | nova | shimmer

    # Chunking
    chunk_size: int = 800
    chunk_overlap: int = 150
    max_file_size_mb: int = 10
    max_repo_files: int = 200

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache
def get_settings() -> Settings:
    return Settings()
