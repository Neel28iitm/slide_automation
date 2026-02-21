"use client";
import { useState, useEffect, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "@/lib/utils";
import { Mic, StopCircle, CheckCircle, RefreshCw, Loader2, Volume2 } from "lucide-react";


type SlideData = {
  id: string;
  slide_index: number;
  title: string;
  type: string;
  content: string;
  notes: string;
};

type SlideUploadStatus = {
  status: "idle" | "uploading" | "done" | "error";
  total_slides: number;
  chunks_created: number;
  message: string;
  slides: SlideData[];
};

export default function StudioPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");

  // Generate session ID client-side only to avoid hydration mismatch
  useEffect(() => {
    setSessionId(nanoid(16));
  }, []);
  const [provider, setProvider] = useState("gemini");

  // Documentation upload state
  const [docStatus, setDocStatus] = useState<{ status: "idle" | "uploading" | "done" | "error"; pages: number; chunks: number; message: string; filename: string }>({
    status: "idle", pages: 0, chunks: 0, message: "", filename: "",
  });
  const [docDragActive, setDocDragActive] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Slide upload state
  const [slideStatus, setSlideStatus] = useState<SlideUploadStatus>({ status: "idle", total_slides: 0, chunks_created: 0, message: "", slides: [] });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Documentation Upload ─────────────────────────────────────────────
  const handleDocUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      setDocStatus({ status: "error", pages: 0, chunks: 0, message: "Only PDF files are supported", filename: "" });
      return;
    }

    setDocStatus({ status: "uploading", pages: 0, chunks: 0, message: `Uploading ${file.name}...`, filename: file.name });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_id", sessionId);

      const r = await fetch("http://localhost:8000/api/ingest/upload-docs", {
        method: "POST",
        body: formData,
      });

      const text = await r.text();
      if (!text) throw new Error("Empty response from server");
      const data = JSON.parse(text);

      if (!r.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setDocStatus({
        status: "done",
        pages: data.total_pages,
        chunks: data.chunks_created,
        message: data.message,
        filename: data.filename,
      });

    } catch (e) {
      setDocStatus({ status: "error", pages: 0, chunks: 0, message: (e as Error).message, filename: "" });
    }
  };

  const handleDocDrop = (e: DragEvent) => {
    e.preventDefault();
    setDocDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleDocUpload(file);
  };

  const handleDocDragOver = (e: DragEvent) => { e.preventDefault(); setDocDragActive(true); };
  const handleDocDragLeave = () => setDocDragActive(false);

  const handleDocFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleDocUpload(file);
  };

  // ── Slide Upload ──────────────────────────────────────────────────────
  const handleSlideUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pptx" && ext !== "pdf") {
      setSlideStatus({ status: "error", total_slides: 0, chunks_created: 0, message: "Only .pptx and .pdf files are supported", slides: [] });
      return;
    }

    setSlideStatus({ status: "uploading", total_slides: 0, chunks_created: 0, message: `Uploading ${file.name}...`, slides: [] });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_id", sessionId);

      const r = await fetch("http://localhost:8000/api/ingest/upload-slides", {
        method: "POST",
        body: formData,
      });

      const text = await r.text();
      if (!text) throw new Error("Empty response from server");
      const data = JSON.parse(text);

      if (!r.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setSlideStatus({
        status: "done",
        total_slides: data.total_slides,
        chunks_created: data.chunks_created,
        message: data.message,
        slides: data.slides,
      });

      localStorage.setItem("cd_slides", JSON.stringify(data.slides));

    } catch (e) {
      setSlideStatus({ status: "error", total_slides: 0, chunks_created: 0, message: (e as Error).message, slides: [] });
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSlideUpload(file);
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = () => setDragActive(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSlideUpload(file);
  };

  const handleStart = () => {
    localStorage.setItem("cd_session", JSON.stringify({ sessionId, provider }));
    localStorage.setItem("cd_theme", theme);
    localStorage.setItem("cd_tone", customTone); // PERSIST TONE
    router.push(`/present?session=${sessionId}`);
  };

  const canLaunch = docStatus.status === "done" && slideStatus.status === "done";

  // ── AI Generation ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState("professional");
  const [customTone, setCustomTone] = useState("");
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<"idle" | "recording" | "processing" | "cloned">("idle");
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const leftChannelRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    const savedTone = localStorage.getItem("cd_tone");
    if (savedTone) setCustomTone(savedTone);
    const savedVoice = localStorage.getItem("cd_voice_id");
    if (savedVoice) {
      setClonedVoiceId(savedVoice);
      setRecordingStatus("cloned");
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      leftChannelRef.current = [];

      processor.onaudioprocess = (e) => {
        const left = e.inputBuffer.getChannelData(0);
        leftChannelRef.current.push(new Float32Array(left));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setRecordingStatus("recording");
    } catch (err) {
      console.error("Error accessing mic:", err);
      alert("Mic permission denied or not available");
    }
  };

  const stopRecording = () => {
    if (isRecording && processorRef.current) {
      processorRef.current.disconnect();
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      setIsRecording(false);

      // Finalize WAV
      const buffer = flattenArray(leftChannelRef.current);
      const wavBlob = createWavBlob(buffer, audioContextRef.current?.sampleRate || 44100);
      handleVoiceUpload(wavBlob);
    }
  };

  const flattenArray = (channel: Float32Array[]) => {
    const result = new Float32Array(channel.reduce((acc, val) => acc + val.length, 0));
    let offset = 0;
    for (const chunk of channel) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  };

  const createWavBlob = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let index = 44;
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(index, samples[i] * 32767, true);
      index += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const handleVoiceUpload = async (blob: Blob) => {
    setRecordingStatus("processing");
    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("audio", blob, "sample.wav");

      const res = await fetch("/api/voice/clone", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Voice cloning failed");
      const data = await res.json();
      setClonedVoiceId(data.voice_id);
      localStorage.setItem("cd_voice_id", data.voice_id);
      setRecordingStatus("cloned");
    } catch (err) {
      console.error("Upload error:", err);
      setRecordingStatus("idle");
      alert("Cloning failed. Try again.");
    }
  };
  const [generationStatus, setGenerationStatus] = useState<{ status: "idle" | "generating" | "done" | "error"; message: string; downloadUrl: string }>({
    status: "idle", message: "", downloadUrl: ""
  });

  const handleGenerate = async () => {
    if (docStatus.status !== "done") {
      alert("Please upload project documentation first!");
      return;
    }

    setGenerationStatus({ status: "generating", message: "Agent 1: Reading documentation...", downloadUrl: "" });
    localStorage.setItem("cd_theme", theme);
    localStorage.setItem("cd_tone", customTone);

    // Simulate progress for UX
    setTimeout(() => setGenerationStatus(prev => ({ ...prev, message: "Agent 1: Extracting key insights (Gemini Flash)..." })), 3000);
    setTimeout(() => setGenerationStatus(prev => ({ ...prev, message: "Agent 2: Designing slide structure (Gemini Pro)..." })), 6000);
    setTimeout(() => setGenerationStatus(prev => ({ ...prev, message: "Builder: Generating PPTX file with " + theme + " theme..." })), 10000);

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("topic", "Project Overview");
      formData.append("theme", theme);

      const r = await fetch("http://localhost:8000/api/ingest/generate-presentation", {
        method: "POST",
        body: formData,
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Generation failed");

      setGenerationStatus({ status: "done", message: "Presentation Ready!", downloadUrl: data.download_url });

      if (data.slides) {
        setSlideStatus({
          status: "done",
          total_slides: data.slides.length,
          chunks_created: data.slides.length,
          message: "AI Presentation Generated",
          slides: data.slides,
        });
        localStorage.setItem("cd_slides", JSON.stringify(data.slides));
      } else {
        setSlideStatus({
          status: "done",
          total_slides: 10,
          chunks_created: 10,
          message: "AI Presentation Generated",
          slides: [],
        });
      }
    } catch (e) {
      setGenerationStatus({ status: "error", message: (e as Error).message, downloadUrl: "" });
    }
  };

  // Determine current step for UI styling
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (docStatus.status === "done") setStep(2);
    if (slideStatus.status === "done") setStep(3);
    if (recordingStatus === "cloned") setStep(4); // Assuming voice cloning is step 3, then theme is step 4
  }, [docStatus.status, slideStatus.status, recordingStatus]);


  return (
    <main className="min-h-screen bg-[#0a0d14] text-white flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-kearney-gold font-serif font-bold text-2xl">CD</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400">Studio</span>
          </div>
          <h1 className="text-3xl font-serif text-white mb-2">Setup Your Deck</h1>
          <p className="text-gray-500 text-sm">Upload your project documentation, add your slides — AI does the rest.</p>
        </div>

        {/* Step 1: Documentation Upload */}
        <div className="bg-[#111827] border border-[#1e2a3a] rounded-2xl p-6 mb-4" style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-kearney-gold text-black text-xs font-bold flex items-center justify-center">1</span>
            <span className="font-semibold text-sm">Upload Project Documentation</span>
            {docStatus.status === "done" && <span className="ml-auto text-green-400 text-xs">✅ {docStatus.pages} pages indexed</span>}
          </div>

          <div
            onDrop={handleDocDrop}
            onDragOver={handleDocDragOver}
            onDragLeave={handleDocDragLeave}
            onClick={() => docInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${docDragActive ? "border-kearney-gold bg-kearney-gold/5" : "border-[#1e3050] hover:border-gray-600"
              } ${docStatus.status === "uploading" ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="text-3xl mb-2">📄</div>
            <p className="text-gray-400 text-sm">
              {docStatus.status === "uploading"
                ? `⏳ Processing ${docStatus.filename}...`
                : docStatus.status === "done"
                  ? `✅ ${docStatus.filename} — ${docStatus.pages} pages, ${docStatus.chunks} chunks`
                  : "Drag & drop your project documentation .pdf here"}
            </p>
            <p className="text-gray-600 text-xs mt-1">or click to browse</p>
            <input ref={docInputRef} type="file" accept=".pdf" onChange={handleDocFileSelect} className="hidden" />
          </div>
        </div>

        {/* Step 2: Upload Slides */}
        <div className="bg-[#111827] border border-[#1e2a3a] rounded-2xl p-6 mb-4" style={{ animation: "fadeIn 0.5s ease-out" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-kearney-gold text-black text-xs font-bold flex items-center justify-center">2</span>
            <span className="font-semibold text-sm">Upload Presentation Slides</span>
            {slideStatus.status === "done" && <span className="ml-auto text-green-400 text-xs">✅ {slideStatus.total_slides} slides</span>}
          </div>

          <div
            className={`drop-zone rounded-xl p-8 text-center cursor-pointer transition-all ${dragActive ? "active" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pptx,.pdf" onChange={handleFileSelect} className="hidden" />

            {slideStatus.status === "idle" && (
              <div>
                <div className="text-3xl mb-3">📊</div>
                <p className="text-sm text-gray-400 mb-1">Drag & drop your <span className="text-kearney-gold">.pptx</span> or <span className="text-kearney-gold">.pdf</span> file here</p>
                <p className="text-xs text-gray-700 mb-4">or click to browse</p>

                {docStatus.status === "done" && (
                  <div className="border-t border-[#1e2a3a] pt-4 mt-2" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs text-gray-500 mb-2">OR</p>
                    <button
                      onClick={handleGenerate}
                      disabled={generationStatus.status === "generating"}
                      className="bg-[#1e2a3a] hover:bg-[#2a3b50] text-kearney-gold text-xs px-4 py-2 rounded-full border border-kearney-gold/30 transition flex items-center gap-2 mx-auto"
                    >
                      {generationStatus.status === "generating" ? "✨ AI is thinking..." : "✨ Auto-Generate with Gemini"}
                    </button>
                    {generationStatus.status === "generating" && (
                      <p className="text-[10px] text-gray-400 mt-2 animate-pulse">{generationStatus.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {slideStatus.status === "uploading" && (
              <div>
                <div className="text-3xl mb-3 animate-pulse">⏳</div>
                <p className="text-sm text-blue-300">{slideStatus.message}</p>
              </div>
            )}

            {slideStatus.status === "done" && (
              <div>
                <div className="text-3xl mb-3">✅</div>
                <p className="text-sm text-green-400">{slideStatus.message}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                  {slideStatus.slides.slice(0, 5).map((s, i) => (
                    <span key={i} className="text-[10px] bg-[#1e2a3a] text-gray-400 px-2 py-1 rounded-lg">
                      {s.title.slice(0, 20)}...
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Voice Identity (Optional) */}
        <div className={`p-6 mb-4 rounded-2xl border transition-all duration-500 ${step >= 3 ? 'bg-[#111827] border-[#1e2a3a] shadow-2xl scale-100' : 'bg-[#0d1220]/50 border-[#1e2a3a]/30 scale-95 opacity-50 overflow-hidden'
          }`} style={{ animation: "fadeIn 0.6s ease-out" }}>
          <div className="flex items-start gap-2 mb-4">
            <span className={`w-6 h-6 rounded-full text-black text-xs font-bold flex items-center justify-center transition-colors duration-500 ${recordingStatus === 'cloned' ? 'bg-green-500' : 'bg-kearney-gold'
              }`}>
              {recordingStatus === 'cloned' ? '✅' : '3'}
            </span>
            <div>
              <span className="font-semibold text-sm">Voice Identity (Instant Clone)</span>
              <p className="text-gray-400 text-xs">Capture your essence so the AI speaks like you.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0d1220] border border-[#1e2a3a] rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Read this aloud:</p>
              <p className="text-sm text-white font-medium leading-relaxed italic">
                "This presentation covers our strategic roadmap for the coming year. I want to ensure every stakeholder understands our commitment to growth, innovation, and client success. Let's dive into the core objectives together."
              </p>
            </div>

            <div className="flex items-center gap-4">
              {recordingStatus === "idle" && (
                <button
                  onClick={startRecording}
                  className="group flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl font-bold text-sm hover:bg-kearney-gold transition-all active:scale-95"
                >
                  <Mic className="w-4 h-4 group-hover:animate-pulse" />
                  Start Voice Capture
                </button>
              )}

              {recordingStatus === "recording" && (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm animate-pulse"
                >
                  <StopCircle className="w-4 h-4" />
                  Stop & Clone
                </button>
              )}

              {recordingStatus === "processing" && (
                <div className="flex items-center gap-2 text-kearney-gold px-4 py-2 bg-kearney-gold/5 border border-kearney-gold/20 rounded-xl font-bold text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cloning Essence...
                </div>
              )}

              {recordingStatus === "cloned" && (
                <div className="flex flex-1 items-center justify-between gap-4 bg-green-500/10 border border-green-500/20 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Voice Identity Secured
                  </div>
                  <button
                    onClick={() => setRecordingStatus("idle")}
                    className="text-gray-500 hover:text-white transition"
                    title="Re-record"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {recordingStatus === "idle" && (
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <span className="text-blue-400">ℹ️</span> Local cloning takes ~5-10s of audio to capture your tone.
              </p>
            )}
          </div>
        </div>

        {/* Step 4: Theme Selector */}
        <div className="bg-[#111827] border border-[#1e2a3a] rounded-2xl p-6 mb-4" style={{ animation: "fadeIn 0.7s ease-out" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-kearney-gold text-black text-xs font-bold flex items-center justify-center">4</span>
            <span className="font-semibold text-sm">Choose Style & Theme</span>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-6">
            {[
              { id: "professional", label: "Professional", color: "#1a365d" },
              { id: "creative", label: "Creative", color: "#c53030" },
              { id: "minimal", label: "Minimal", color: "#edf2f7" },
              { id: "academic", label: "Academic", color: "#2c5282" },
              { id: "dark", label: "Dark", color: "#0d1117" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${theme === t.id ? "bg-kearney-gold/10 border-kearney-gold" : "bg-[#0d1220] border-[#1e2a3a] hover:border-gray-700"
                  }`}
              >
                <div className="w-full aspect-video rounded-md shadow-inner" style={{ background: t.color }} />
                <span className={`text-[9px] font-bold uppercase transition-colors ${theme === t.id ? "text-kearney-gold" : "text-gray-500"}`}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-[#1e2a3a] pt-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-kearney-gold text-sm">🎙️</span>
              <label className="text-xs font-semibold text-gray-300">Custom Assistant Tone (Optional)</label>
            </div>
            <input
              type="text"
              value={customTone}
              onChange={(e) => setCustomTone(e.target.value)}
              placeholder="e.g. Speak like a funny pirate, use corporate jargon, or talk in Hinglish..."
              className="w-full bg-[#0d1220] border border-[#1e2a3a] rounded-xl px-4 py-3 text-sm text-white focus:border-kearney-gold/50 outline-none transition"
            />
            <p className="text-[10px] text-gray-600 mt-2">This instruction will guide how the AI assistant talks to you during the presentation.</p>
          </div>
        </div>

        {/* Step 4: AI Provider */}
        <div className="bg-[#111827] border border-[#1e2a3a] rounded-2xl p-6 mb-4" style={{ animation: "fadeIn 0.7s ease-out" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-kearney-gold text-black text-xs font-bold flex items-center justify-center">4</span>
            <span className="font-semibold text-sm">AI Provider</span>
          </div>
          <div className="flex gap-3">
            {["gemini", "openai", "anthropic", "ollama"].map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${provider === p
                  ? "bg-[#C8922A]/20 border-kearney-gold text-white"
                  : "border-[#1e2a3a] text-gray-500 hover:text-gray-300"
                  }`}
              >
                {p === "gemini" ? "Gemini" : p === "openai" ? "OpenAI" : p === "anthropic" ? "Claude" : "Ollama"}
              </button>
            ))}
          </div>
        </div>

        {/* Launch */}
        <button
          onClick={handleStart}
          disabled={!canLaunch}
          className="w-full bg-kearney-gold text-black py-4 rounded-2xl font-bold text-base disabled:opacity-30 hover:opacity-90 transition mt-2 shadow-xl shadow-kearney-gold/10"
        >
          {canLaunch ? "🚀 Launch Presentation" : "Complete Uploads to Start"}
        </button>
      </div>
    </main>
  );
}

