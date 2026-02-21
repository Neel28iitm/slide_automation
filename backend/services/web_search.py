"""
Web search service for enriching AI chat with real-time information.
Uses DuckDuckGo Instant Answer API (free, no API key) with Gemini summarization.
"""
import logging
import httpx
from typing import Optional
from config import get_settings
import google.generativeai as genai

logger = logging.getLogger(__name__)
cfg = get_settings()


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Search the web using DuckDuckGo Instant Answer API.
    Returns list of {title, url, snippet}.
    """
    results = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # DuckDuckGo Instant Answer API
            r = await client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_html": "1",
                    "skip_disambig": "1",
                },
            )
            data = r.json()

            # Abstract (main answer)
            if data.get("AbstractText"):
                results.append({
                    "title": data.get("Heading", "DuckDuckGo"),
                    "url": data.get("AbstractURL", ""),
                    "snippet": data["AbstractText"][:500],
                })

            # Related topics
            for topic in data.get("RelatedTopics", [])[:max_results - 1]:
                if isinstance(topic, dict) and topic.get("Text"):
                    results.append({
                        "title": topic.get("Text", "")[:80],
                        "url": topic.get("FirstURL", ""),
                        "snippet": topic.get("Text", "")[:300],
                    })

    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}")

    # Fallback: if DuckDuckGo gives no results, try Gemini with grounding
    if not results:
        results = await _gemini_grounded_search(query)

    return results[:max_results]


async def _gemini_grounded_search(query: str) -> list[dict]:
    """Use Gemini to generate a web-informed answer when DDG fails."""
    try:
        if not cfg.gemini_api_key:
            return []

        genai.configure(api_key=cfg.gemini_api_key)
        model = genai.GenerativeModel(
            model_name=getattr(cfg, "gemini_flash_model", "gemini-2.0-flash"),
        )
        response = model.generate_content(
            f"Search the web and provide a brief factual answer (2-3 sentences) to: {query}",
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=300,
                temperature=0.3,
            ),
        )
        return [{
            "title": "AI Web Search",
            "url": "",
            "snippet": response.text[:500],
        }]
    except Exception as e:
        logger.warning(f"Gemini grounded search failed: {e}")
        return []


async def search_and_summarize(
    query: str,
    slide_context: str = "",
    language: str = "en",
    custom_tone: Optional[str] = None,
) -> tuple[str, list[dict]]:
    """
    Search the web, then use the LLM to produce a contextual summary.
    Returns (summary_text, sources).
    """
    results = await web_search(query)
    if not results:
        return "No web results found for this query.", []

    # Build context from search results
    search_ctx = "\n\n".join(
        f"[{i+1}] {r['title']}\nURL: {r['url']}\n{r['snippet']}"
        for i, r in enumerate(results)
    )

    lang_label = "Hindi (Devanagari)" if language == "hi" else "English"

    # Tone injection
    tone_instruction = f"Personality/Tone: {custom_tone}" if custom_tone else "Tone: Professional, helpful, and concise."

    prompt = f"""You are an expert consultant. A user asked a question during a presentation.
The slide context: {slide_context}

Web search results for their question:
{search_ctx}

Based on the web search results, provide a concise, accurate answer (2-4 sentences).
Cite source numbers like [1], [2] where relevant.
Respond in {lang_label}.
{tone_instruction}"""

    try:
        genai.configure(api_key=cfg.gemini_api_key)
        model = genai.GenerativeModel(
            model_name=getattr(cfg, "gemini_flash_model", "gemini-2.0-flash"),
        )
        response = model.generate_content(
            [prompt, f"Question: {query}"],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=300,
                temperature=0.4,
            ),
        )
        answer = response.text
    except Exception as e:
        logger.error(f"LLM summarization failed: {e}")
        answer = results[0]["snippet"] if results else "Search failed."

    sources = [{"source": r["url"], "title": r["title"]} for r in results if r.get("url")]
    return answer, sources
