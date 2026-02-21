"""
ChromaDB vector store.
Each session gets its own isolated collection so multiple
consultants can run independent decks simultaneously.
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List, Dict, Any
from config import get_settings
import hashlib

cfg = get_settings()

import threading

_client: chromadb.PersistentClient = None
_client_lock = threading.Lock()

def get_chroma_client() -> chromadb.PersistentClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = chromadb.PersistentClient(
                path=cfg.chroma_persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
    return _client


def _collection_name(session_id: str) -> str:
    # ChromaDB collection names must be 3-63 chars, alphanumeric + hyphens
    safe = hashlib.md5(session_id.encode()).hexdigest()[:16]
    return f"cd-{safe}"


def get_or_create_collection(session_id: str):
    client = get_chroma_client()
    name = _collection_name(session_id)
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


def delete_collection(session_id: str):
    client = get_chroma_client()
    try:
        client.delete_collection(_collection_name(session_id))
    except Exception:
        pass


# ── Embedding ─────────────────────────────────────────────────────────────────

def get_embedder():
    """Returns an embedding function compatible with ChromaDB."""
    if cfg.ai_provider == "openai":
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        return OpenAIEmbeddingFunction(
            api_key=cfg.openai_api_key,
            model_name=cfg.openai_embedding_model,
        )
    elif cfg.ai_provider == "gemini":
        from chromadb.utils.embedding_functions import GoogleGenerativeAiEmbeddingFunction
        return GoogleGenerativeAiEmbeddingFunction(
            api_key=cfg.gemini_api_key,
            model_name=cfg.gemini_embedding_model,
        )
    else:
        # Fallback: local sentence-transformers (no API key needed)
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        return SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")


# ── Ingestion ─────────────────────────────────────────────────────────────────

def chunk_text(text: str, source_path: str) -> List[Dict[str, Any]]:
    """Split text into overlapping chunks with metadata."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=cfg.chunk_size,
        chunk_overlap=cfg.chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = splitter.split_text(text)
    return [
        {
            "text": chunk,
            "source": source_path,
            "chunk_index": i,
        }
        for i, chunk in enumerate(chunks)
        if chunk.strip()
    ]


def ingest_documents(
    session_id: str,
    documents: List[Dict[str, Any]],   # [{ path, content, extension }]
    slide_id: str = "global",
) -> int:
    """
    Ingest documents into vector store.
    slide_id='global' → available to all slides
    slide_id=specific → only queried when that slide is active
    """
    collection = get_or_create_collection(session_id)
    embedder   = get_embedder()

    all_chunks: List[str] = []
    all_ids:    List[str] = []
    all_meta:   List[Dict] = []

    for doc in documents:
        chunks = chunk_text(doc["content"], doc.get("path", "unknown"))
        # Use slide_id from doc if present, otherwise fallback to the provided arg
        doc_slide_id = doc.get("slide_id", slide_id)
        
        for chunk in chunks:
            uid = hashlib.md5(f"{session_id}{doc.get('path','')}{chunk['chunk_index']}".encode()).hexdigest()
            all_chunks.append(chunk["text"])
            all_ids.append(uid)
            all_meta.append({
                "source":      chunk["source"],
                "slide_id":    doc_slide_id,
                "extension":   doc.get("extension", ""),
                "chunk_index": chunk["chunk_index"],
            })

    # Batch upsert (ChromaDB handles deduplication via IDs)
    BATCH = 100
    for i in range(0, len(all_chunks), BATCH):
        b_texts = all_chunks[i:i+BATCH]
        b_ids   = all_ids[i:i+BATCH]
        b_meta  = all_meta[i:i+BATCH]
        embeddings = embedder(b_texts)
        collection.upsert(
            ids=b_ids,
            documents=b_texts,
            embeddings=embeddings,
            metadatas=b_meta,
        )

    return len(all_chunks)


# ── Query ─────────────────────────────────────────────────────────────────────

def query_collection(
    session_id: str,
    question: str,
    slide_id: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Query the vector store.
    Returns chunks scoped to the active slide first, then global fallback.
    """
    collection = get_or_create_collection(session_id)
    embedder   = get_embedder()

    q_embedding = embedder([question])[0]

    # Slide-specific chunks
    results = collection.query(
        query_embeddings=[q_embedding],
        n_results=min(top_k, max(1, collection.count())),
        where={"slide_id": {"$in": [slide_id, "global"]}},
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    docs  = results["documents"][0] if results["documents"] else []
    metas = results["metadatas"][0] if results["metadatas"] else []
    dists = results["distances"][0] if results["distances"] else []

    for doc, meta, dist in zip(docs, metas, dists):
        chunks.append({
            "content":    doc,
            "source":     meta.get("source", ""),
            "slide_id":   meta.get("slide_id", ""),
            "similarity": round(1 - dist, 3),
        })

    return chunks
