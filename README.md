# 🎤 ConsultDeck Studio
### GitHub → RAG → Voice Q&A Presentation System

> Paste your GitHub repo URL, upload your slides, and your presentation becomes a **live AI expert** that answers client questions — by voice, in English or Hindi.

---

## 🧠 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    ConsultDeck Studio                        │
│                                                             │
│  Step 1: You paste your GitHub repo URL                     │
│          ↓                                                  │
│  Step 2: System auto-fetches ALL files (code, docs, README) │
│          ↓                                                  │
│  Step 3: Files are chunked → embedded → stored in ChromaDB  │
│          ↓                                                  │
│  Step 4: You present your slides to client                  │
│          ↓                                                  │
│  Step 5: Client asks a question (voice or text)             │
│     → Whisper transcribes speech                           │
│     → RAG retrieves relevant code/docs                     │
│     → LLM generates slide-aware answer                     │
│     → TTS speaks the answer aloud                          │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🔗 **GitHub Ingestion** | Paste any public/private repo URL → all files auto-indexed |
| 🧠 **Slide-Scoped RAG** | Each slide activates relevant context from your codebase |
| 🎤 **Voice Input** | Client asks questions verbally — Whisper understands both EN + HI |
| 🔊 **Voice Output** | AI answers spoken aloud via OpenAI TTS |
| 🇮🇳 **Hindi Support** | Full Hinglish/Hindi Q&A supported |
| 🔒 **Self-Hosted** | Your repo data never leaves your infrastructure |
| 🤖 **Multi-Provider** | OpenAI / Claude / Ollama (local) |

---

## 🚀 Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/YOUR_USERNAME/consultdeck-studio.git
cd consultdeck-studio

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — add your OPENAI_API_KEY at minimum
```

### 2. Start with Docker (Recommended)

```bash
docker compose up -d

# Open browser
open http://localhost:3000
```

### 3. Or Run Locally

```bash
# Terminal 1 — Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in your keys
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

---

## 🎯 Usage Flow

### As a Consultant (Setup)

1. Open `http://localhost:3000`
2. Paste your GitHub repo URL (e.g. your RAG system repo)
3. Click **"Fetch & Index Repo"** — wait for green ✅
4. Choose AI provider
5. Click **"Launch Presentation →"**

### During Client Presentation

- Slides show on the main screen
- **Voice Q&A panel** is always visible (bottom-right)
- Client (or you) clicks mic → asks question
- AI answers in real-time with voice
- Language toggle: **EN / हि** (switch anytime)
- Press **V** to toggle voice panel visibility

---

## 🏗️ Architecture

```
consultdeck-studio/
├── backend/                    # Python FastAPI
│   ├── main.py                 # Entry point
│   ├── config.py               # Settings (reads .env)
│   ├── routers/
│   │   ├── ingest.py           # /api/ingest/github, /api/ingest/slide
│   │   ├── rag.py              # /api/rag/query
│   │   └── voice.py            # /api/voice/transcribe, /api/voice/speak
│   ├── services/
│   │   ├── github_fetcher.py   # GitHub API → fetch all files
│   │   ├── vector_store.py     # ChromaDB operations
│   │   ├── rag_service.py      # Query + LLM answer generation
│   │   └── voice_service.py    # Whisper STT + OpenAI TTS
│   └── models/
│       └── schemas.py          # Pydantic request/response models
│
├── frontend/                   # Next.js 14
│   └── src/app/
│       ├── page.tsx            # Studio setup page
│       ├── present/page.tsx    # Presentation + Voice overlay
│       ├── hooks/
│       │   └── useVoiceRAG.ts  # Core voice pipeline hook
│       ├── components/voice/
│       │   └── VoicePanel.tsx  # Voice Q&A UI widget
│       └── api/[...path]/      # Proxy to Python backend
│
└── docker-compose.yml
```

---

## 🔧 Configuration

### AI Providers

| Provider | STT | TTS | RAG | Best For |
|---|---|---|---|---|
| **OpenAI** | Whisper ✅ | TTS-1 ✅ | GPT-4o ✅ | Best quality |
| **Anthropic** | Whisper ✅ | TTS-1 ✅ | Claude ✅ | Best reasoning |
| **Ollama** | Browser API | Browser API | Llama 3.1 | Offline / private |

### For Private GitHub Repos

```env
GITHUB_TOKEN=ghp_your_token_here
```

### Supported File Types (auto-indexed)

`.py` `.ts` `.js` `.tsx` `.md` `.yaml` `.json` `.sql` `.ipynb` `.tf` `.sh` `.dockerfile` `.java` `.go` `.rs` + more

---

## 🗺️ Roadmap

- [ ] Slide upload via PPTX/PDF parsing
- [ ] Multi-session dashboard
- [ ] ElevenLabs voice integration
- [ ] Real-time waveform visualization
- [ ] Export Q&A transcript as PDF

---

## 📄 License

MIT

---

<p align="center">Built for consultants who want their slides to talk back.</p>
