"use client";
import { useState, useRef } from "react";
import { useVoiceRAG, VoiceState } from "@/app/hooks/useVoiceRAG";

interface VoicePanelProps {
  sessionId: string;
  slideId: string;
  slideTitle: string;
  slideContext: string;
}

const STATE_CONFIG: Record<VoiceState, { label: string; color: string; pulse: boolean }> = {
  idle:      { label: "Ask a question",     color: "#C8922A",  pulse: false },
  listening: { label: "Listening...",        color: "#ef4444",  pulse: true  },
  thinking:  { label: "Thinking...",         color: "#3b82f6",  pulse: true  },
  speaking:  { label: "Speaking...",         color: "#10b981",  pulse: true  },
  error:     { label: "Error — try again",   color: "#f97316",  pulse: false },
};

export function VoicePanel({ sessionId, slideId, slideTitle, slideContext }: VoicePanelProps) {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [textInput, setTextInput] = useState("");
  const [history,   setHistory]   = useState<{ q: string; a: string }[]>([]);

  const {
    state, transcript, answer, sources, error,
    startListening, stopListening, askText, stopSpeaking, reset,
  } = useVoiceRAG({
    sessionId, slideId, slideTitle, slideContext, language,
    onAnswer: (a) => {
      if (transcript) setHistory(p => [{ q: transcript, a }, ...p].slice(0, 5));
    },
  });

  const cfg = STATE_CONFIG[state];

  const handleMicClick = () => {
    if (state === "idle" || state === "error")   startListening();
    else if (state === "listening")              stopListening();
    else if (state === "speaking")               stopSpeaking();
  };

  const handleTextAsk = () => {
    if (!textInput.trim() || state !== "idle") return;
    askText(textInput);
    setTextInput("");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px]">
      <div className="bg-[#0d1117]/95 backdrop-blur border border-[#1e2a3a] rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2a3a]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: cfg.color, animation: cfg.pulse ? "pulse 1.5s infinite" : "none" }} />
            <span className="text-xs text-gray-400">{cfg.label}</span>
          </div>
          {/* Language toggle */}
          <div className="flex gap-1 bg-[#111827] rounded-lg p-0.5">
            {(["en", "hi"] as const).map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`text-xs px-2.5 py-1 rounded-md transition ${language === l ? "bg-kearney-blue text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                {l === "en" ? "EN" : "हि"}
              </button>
            ))}
          </div>
        </div>

        {/* Transcript / Answer area */}
        <div className="px-4 py-3 min-h-[80px] max-h-[200px] overflow-y-auto">
          {state === "idle" && !answer && history.length === 0 && (
            <p className="text-xs text-gray-700 italic">
              {language === "en"
                ? `Ask me anything about "${slideTitle}"`
                : `"${slideTitle}" के बारे में कुछ भी पूछें`}
            </p>
          )}

          {transcript && (
            <div className="mb-2">
              <p className="text-[10px] text-gray-600 mb-0.5">YOU</p>
              <p className="text-sm text-blue-200">{transcript}</p>
            </div>
          )}

          {state === "thinking" && (
            <div className="flex gap-1.5 my-2">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-blue-500"
                  style={{ animation: `bounceDot 1.2s ${i*0.2}s ease-in-out infinite` }} />
              ))}
            </div>
          )}

          {answer && (
            <div>
              <p className="text-[10px] text-kearney-gold mb-0.5">AI ASSISTANT</p>
              <p className="text-sm text-gray-200 leading-relaxed">{answer}</p>
              {sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sources.map((s, i) => (
                    <span key={i} className="text-[9px] bg-[#1e2a3a] text-gray-500 px-1.5 py-0.5 rounded">
                      {s.source.split("/").pop()} ({Math.round(s.similarity * 100)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* History (collapsed) */}
        {history.length > 0 && state === "idle" && !answer && (
          <div className="px-4 pb-2">
            <p className="text-[9px] text-gray-700 mb-1">PREVIOUS</p>
            {history.slice(0, 2).map((h, i) => (
              <p key={i} className="text-[10px] text-gray-600 truncate mb-0.5">Q: {h.q}</p>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="px-4 pb-4 pt-2 flex gap-2">
          {/* Text input */}
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleTextAsk()}
            placeholder={language === "en" ? "Type a question..." : "प्रश्न टाइप करें..."}
            disabled={state !== "idle"}
            className="flex-1 bg-[#111827] border border-[#1e3050] text-white text-xs px-3 py-2 rounded-xl outline-none placeholder-gray-700 disabled:opacity-40"
          />

          {/* Mic button */}
          <button
            onClick={handleMicClick}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: state === "listening" ? "#ef4444" : state === "speaking" ? "#10b981" : cfg.color,
              transform: state === "listening" ? "scale(1.1)" : "scale(1)",
            }}
          >
            {state === "listening"  && <span className="text-white text-sm">■</span>}
            {state === "speaking"   && <span className="text-white text-sm">⏸</span>}
            {state === "thinking"   && <span className="text-white text-xs animate-spin">⟳</span>}
            {(state === "idle" || state === "error") && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
          </button>

          {/* Send text */}
          <button
            onClick={handleTextAsk}
            disabled={!textInput.trim() || state !== "idle"}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-kearney-blue text-white text-sm disabled:opacity-30 flex-shrink-0"
          >
            →
          </button>
        </div>

        {/* Slide context badge */}
        <div className="px-4 pb-3">
          <p className="text-[9px] text-gray-700 truncate">
            🎯 Context: <span className="text-gray-600">{slideTitle}</span>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes bounceDot { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      `}</style>
    </div>
  );
}
