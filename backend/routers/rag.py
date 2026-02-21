from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from models.schemas import RAGQueryRequest, RAGQueryResponse, WebSearchRequest
from services.rag_service import answer_question
from services.web_search import search_and_summarize

router = APIRouter()


# WebSearchRequest moved to schemas.py


@router.post("/query", response_model=RAGQueryResponse)
async def query_rag(req: RAGQueryRequest):
    try:
        answer, sources = await answer_question(
            session_id    = req.session_id,
            slide_id      = req.slide_id,
            slide_title   = req.slide_title,
            slide_context = req.slide_context,
            question      = req.question,
            language      = req.language,
            top_k         = req.top_k,
            custom_tone   = req.custom_tone,
        )
        return RAGQueryResponse(
            answer   = answer,
            sources  = sources,
            language = req.language,
            slide_id = req.slide_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/web-search")
async def web_search_endpoint(req: WebSearchRequest):
    """
    Search the web and return an AI-summarized answer.
    Use when the question goes beyond the ingested documentation.
    """
    try:
        answer, sources = await search_and_summarize(
            query=req.query,
            slide_context=req.slide_context,
            language=req.language,
            custom_tone=req.custom_tone,
        )
        return {
            "answer": answer,
            "sources": sources,
            "type": "web_search",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

