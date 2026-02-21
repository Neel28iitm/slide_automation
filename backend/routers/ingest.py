from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from models.schemas import GitHubIngestRequest, SlideIngestRequest, IngestStatus, SlideUploadResponse
from services.github_fetcher import fetch_repo_files
from services.vector_store import ingest_documents, delete_collection
from services.slide_parser import parse_file
import asyncio
import fitz  # PyMuPDF
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory status tracker (use Redis in production)
_status: dict[str, IngestStatus] = {}


@router.post("/github", response_model=IngestStatus)
async def ingest_github(req: GitHubIngestRequest, bg: BackgroundTasks):
    """
    Kick off GitHub repo ingestion in background.
    Returns immediately with status=processing.
    Poll /status/{session_id} to track progress.
    """
    _status[req.session_id] = IngestStatus(
        session_id=req.session_id,
        status="processing",
        message="Fetching repository files...",
    )
    bg.add_task(_run_github_ingest, req)
    return _status[req.session_id]


async def _run_github_ingest(req: GitHubIngestRequest):
    sid = req.session_id
    try:
        _status[sid].message = "Cloning repository tree..."
        files = await fetch_repo_files(
            req.repo_url,
            branch=req.branch,
            include_extensions=req.include_extensions,
        )
        _status[sid].total_files = len(files)
        _status[sid].message = f"Fetched {len(files)} files. Embedding..."

        chunks = ingest_documents(
            session_id=sid,
            documents=files,
            slide_id="global",
        )
        _status[sid].files_processed = len(files)
        _status[sid].chunks_created  = chunks
        _status[sid].status  = "ready"
        _status[sid].message = f"✅ Ready — {len(files)} files, {chunks} chunks indexed"

    except Exception as e:
        _status[sid].status  = "error"
        _status[sid].message = f"Error: {str(e)}"


@router.post("/upload-docs")
async def upload_docs(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    """
    Upload a PDF documentation file.
    Parses all pages, chunks the text, and embeds as global knowledge base.
    """
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext != "pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported for documentation upload.")

    try:
        file_bytes = await file.read()
        logger.info(f"[upload-docs] Parsing PDF: {filename} ({len(file_bytes)} bytes)")

        # Extract text from each page
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        full_text = ""
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                pages.append({"page": i + 1, "text": text})
                full_text += f"\n\n--- Page {i+1} ---\n{text}"
        doc.close()

        if not pages:
            raise HTTPException(status_code=400, detail="PDF appears to be empty or image-only. No text could be extracted.")

        logger.info(f"[upload-docs] Extracted {len(pages)} pages of text")

        # Create document objects for ingestion
        documents = [
            {
                "path": f"{filename}:page-{p['page']}",
                "content": p["text"],
                "extension": ".pdf",
            }
            for p in pages
        ]

        # Ingest into vector store as global context
        chunks = await run_in_threadpool(
            ingest_documents,
            session_id=session_id,
            documents=documents,
            slide_id="global",
        )

        logger.info(f"[upload-docs] ✅ Done — {len(pages)} pages, {chunks} chunks indexed")

        return {
            "status": "ok",
            "filename": filename,
            "total_pages": len(pages),
            "chunks_created": chunks,
            "message": f"✅ {len(pages)} pages parsed, {chunks} chunks indexed",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[upload-docs] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Documentation parsing failed: {str(e)}")


@router.post("/slide")
async def ingest_slide(req: SlideIngestRequest):
    """
    Index a single slide's content into the vector store,
    tagged with its slide_id so queries are scoped to it.
    """
    doc = {
        "path":      f"slide:{req.slide_id}:{req.slide_title}",
        "content":   f"Slide: {req.slide_title}\nType: {req.slide_type}\nContent: {req.slide_context}",
        "extension": ".slide",
    }
    chunks = ingest_documents(
        session_id=req.session_id,
        documents=[doc],
        slide_id=req.slide_id,
    )
    return {"status": "ok", "chunks": chunks}


from fastapi.concurrency import run_in_threadpool

@router.post("/upload-slides", response_model=SlideUploadResponse)
async def upload_slides(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    """
    Upload a PPTX or PDF presentation file.
    Parses slides, ingests each slide into the vector store,
    and returns the parsed slide data for frontend rendering.
    """
    # Validate file type
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("pptx", "pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Upload a .pptx or .pdf file."
        )

    try:
        file_bytes = await file.read()
        
        # Run heavy parsing (Gemini Vision) - now parallelized internally
        slides = await parse_file(file_bytes, filename)

        # Prepare all slides for batch ingestion
        documents = []
        for slide in slides:
            documents.append({
                "path": f"slide:{slide['id']}:{slide['title']}",
                "content": f"Slide: {slide['title']}\nType: {slide['type']}\nContent: {slide['content']}\nNotes: {slide['notes']}",
                "extension": ".slide",
                "slide_id": slide["id"] # Important: our new per-doc slide_id support
            })

        total_chunks = await run_in_threadpool(
            ingest_documents,
            session_id=session_id,
            documents=documents,
            slide_id="global" # Fallback if no slide_id in doc
        )

        return SlideUploadResponse(
            status="ok",
            total_slides=len(slides),
            slides=slides,
            chunks_created=total_chunks,
            message=f"✅ {len(slides)} slides parsed, {total_chunks} chunks indexed",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Slide upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Slide parsing failed: {str(e)}")


@router.get("/status/{session_id}", response_model=IngestStatus)
async def get_status(session_id: str):
    if session_id not in _status:
        return IngestStatus(session_id=session_id, status="not_started")
    return _status[session_id]


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clean up vector data for a session."""
    delete_collection(session_id)
    _status.pop(session_id, None)
    return {"status": "deleted"}
