from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import ingest, rag, voice, presentation

app = FastAPI(
    title="ConsultDeck Studio API",
    description="RAG-powered slide-aware voice Q&A backend",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router,        prefix="/api/ingest",        tags=["Ingestion"])
app.include_router(rag.router,           prefix="/api/rag",           tags=["RAG"])
app.include_router(voice.router,         prefix="/api/voice",         tags=["Voice"])
app.include_router(presentation.router,  prefix="/api/presentation",  tags=["Presentation"])

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ConsultDeck Studio"}
