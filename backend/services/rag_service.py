"""
RAG pipeline:
  1. Retrieve relevant chunks (slide-scoped)
  2. Build context-aware prompt
  3. Generate answer via LLM
"""
from services.vector_store import query_collection
from config import get_settings
from typing import Optional
import httpx
import google.generativeai as genai

cfg = get_settings()

SYSTEM_PROMPT = """You are an expert AI consultant assistant embedded in a live client presentation.

The presenter is showing the client a slide titled: "{slide_title}"

The slide covers: {slide_context}

Your job:
- Answer the client's question using the retrieved code/documentation context below
- Be precise, professional, and concise (2-4 sentences for voice delivery)
- If the question is about implementation details, refer to actual code/architecture
- Always relate your answer back to the client's business value
- Respond in {language}

Retrieved context from the repository:
{context}
"""

HINDI_INSTRUCTION = "Respond in Hindi (Devanagari script). Be clear and professional."
ENGLISH_INSTRUCTION = "Respond in English. Be clear and professional."


async def answer_question(
    session_id: str,
    slide_id: str,
    slide_title: str,
    slide_context: str,
    question: str,
    language: str = "en",
    top_k: int = 5,
    custom_tone: Optional[str] = None,
) -> tuple[str, list]:
    """
    Returns (answer_text, sources_list)
    """
    # 1. Retrieve relevant chunks
    chunks = query_collection(session_id, question, slide_id, top_k)

    # 2. Build context string
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        context_parts.append(f"[{i}] File: {chunk['source']}\n{chunk['content']}")
    context_str = "\n\n---\n\n".join(context_parts) if context_parts else "No specific code context found. Answer from general knowledge."

    lang_label = "Hindi" if language == "hi" else "English"
    lang_instruction = HINDI_INSTRUCTION if language == "hi" else ENGLISH_INSTRUCTION

    # Tone injection
    tone_instruction = f"Personality/Tone: {custom_tone}" if custom_tone else "Tone: Professional, helpful, and concise."

    system = SYSTEM_PROMPT.format(
        slide_title=slide_title,
        slide_context=slide_context,
        language=f"{lang_label}. {lang_instruction}\n{tone_instruction}",
        context=context_str,
    )

    # 3. Call LLM
    answer = await _call_llm(system, question)

    sources = [{"source": c["source"], "similarity": c["similarity"]} for c in chunks[:3]]
    return answer, sources


async def _call_llm(system: str, question: str) -> str:
    if cfg.ai_provider == "gemini":
        return await _gemini(system, question)
    elif cfg.ai_provider == "openai":
        return await _openai(system, question)
    elif cfg.ai_provider == "anthropic":
        return await _anthropic(system, question)
    else:
        return await _ollama(system, question)


async def _openai(system: str, question: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {cfg.openai_api_key}"},
            json={
                "model": cfg.openai_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": question},
                ],
                "max_tokens": 300,
                "temperature": 0.4,
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _anthropic(system: str, question: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": cfg.anthropic_api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": cfg.anthropic_model,
                "max_tokens": 300,
                "system": system,
                "messages": [{"role": "user", "content": question}],
            },
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]


async def _ollama(system: str, question: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{cfg.ollama_base_url}/api/chat",
            json={
                "model": cfg.ollama_model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": question},
                ],
            },
        )
        r.raise_for_status()
        return r.json()["message"]["content"]


from fastapi.concurrency import run_in_threadpool

async def _gemini(system: str, question: str) -> str:
    genai.configure(api_key=cfg.gemini_api_key)
    model_name = cfg.gemini_model if hasattr(cfg, "gemini_model") else cfg.gemini_flash_model
    
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system,
    )
    
    response = await run_in_threadpool(
        model.generate_content,
        question,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=300,
            temperature=0.4,
        ),
    )
    return response.text

