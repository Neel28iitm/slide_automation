"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AIChatPanel } from "@/app/components/chat/AIChatPanel";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Themes (Sync with backend THEME_PRESETS) ────────────────────────────────
const THEMES: Record<string, any> = {
  professional: {
    bg: "#FFFFFF",
    header: "#1a365d",
    accent: "#ed8936",
    text: "#2d3748",
    titleBg: "#1a365d",
    fontColor: "#FFFFFF",
  },
  creative: {
    bg: "#FFF5F5",
    header: "#e53e3e",
    accent: "#38a169",
    text: "#2d3748",
    titleBg: "#c53030",
    fontColor: "#FFFFFF",
  },
  minimal: {
    bg: "#f8f9fa",
    header: "#2d3748",
    accent: "#4299e1",
    text: "#2d3748",
    titleBg: "#edf2f7",
    fontColor: "#2d3748",
  },
  academic: {
    bg: "#FFFFFF",
    header: "#2c5282",
    accent: "#d69e2e",
    text: "#2d3748",
    titleBg: "#2c5282",
    fontColor: "#FFFFFF",
  },
  dark: {
    bg: "#1a202c",
    header: "#0d1117",
    accent: "#C8922A",
    text: "#e2e8f0",
    titleBg: "#0d1117",
    fontColor: "#FFFFFF",
  },
};

// ── Slide renderer ───────────────────────────────────────────────────────────
function SlideView({ slide, themeName = "professional" }: { slide: any; themeName?: string }) {
  if (!slide) return <div className="flex items-center justify-center h-full text-gray-500">No slide</div>;

  const theme = THEMES[themeName] || THEMES.professional;

  // 1. Title Slide
  if (slide.type === "title") {
    return (
      <div className="h-full flex flex-col justify-center px-16 relative overflow-hidden" style={{ background: theme.titleBg }}>
        {/* Subtle decorative element */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${theme.accent} 0%, transparent 70%)` }} />

        <p className="text-[10px] tracking-[6px] uppercase mb-4 font-mono font-bold" style={{ color: theme.accent }}>
          {slide.subtitle || "PROJECT PRESENTATION"}
        </p>
        <h1 className="text-5xl font-serif font-bold text-white leading-[1.1] max-w-3xl mb-8">
          {slide.title}
        </h1>
        <div className="w-20 h-1 mb-8" style={{ background: theme.accent }} />
        <p className="text-blue-200/60 text-sm font-mono flex items-center gap-3">
          <span>{slide.clientName || "ConsultDeck Studio"}</span>
          <span className="opacity-30">|</span>
          <span>{slide.date || new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
        </p>
      </div>
    );
  }

  // 2. Section / Closing Slide
  if (slide.type === "section" || slide.type === "closing") {
    return (
      <div className="h-full flex items-center justify-center px-20 text-center" style={{ background: theme.header }}>
        <div className="max-w-2xl">
          <div className="w-10 h-0.5 mx-auto mb-6" style={{ background: theme.accent }} />
          <h2 className="text-4xl font-serif text-white leading-tight mb-4">{slide.title}</h2>
          {slide.content && <p className="text-gray-400 text-lg font-light">{slide.content}</p>}
        </div>
      </div>
    );
  }

  // 3. Agenda Slide
  if (slide.type === "agenda") {
    // Treat context as items if possible
    const items = slide.content ? slide.content.split("\n").filter((l: string) => l.trim()) : [];
    return (
      <div className="h-full flex flex-col pt-12" style={{ background: theme.header }}>
        <div className="px-12 mb-8">
          <h2 className="text-white text-3xl font-serif font-bold">Agenda</h2>
          <div className="w-12 h-1 mt-2" style={{ background: theme.accent }} />
        </div>
        <div className="flex-1 px-12 grid grid-cols-2 gap-4 pb-12">
          {items.map((item: string, i: number) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-xl border-l-4 flex items-start gap-4 transition-transform hover:scale-[1.02]"
              style={{ borderLeftColor: theme.accent }}>
              <span className="text-xl font-bold opacity-10" style={{ color: theme.header }}>0{i + 1}</span>
              <p className="text-sm font-medium text-gray-800 pt-1">{item.replace(/^[-*]\s*/, "")}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4. Content Slide (Default) - Premium Card Layout
  return (
    <div className="h-full flex flex-col relative" style={{ background: theme.header }}>
      {/* Slide Header */}
      <div className="px-10 pt-8 pb-4 flex justify-between items-end relative z-10">
        <div>
          <p className="text-[9px] tracking-[4px] uppercase font-bold mb-1" style={{ color: theme.accent }}>
            {slide.type?.replace("-", " ").toUpperCase() || "STRATEGY"}
          </p>
          <h2 className="text-white text-3xl font-serif font-semibold">{slide.title}</h2>
        </div>
        <div className="text-[10px] text-white/30 font-mono tracking-tighter">ConsultDeck Pro</div>
      </div>

      {/* Main Content Card with Shadow */}
      <div className="mx-10 mb-10 flex-1 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col relative">
        {/* Subtle accent line on top of card */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }} />

        <div className="flex-1 p-10 overflow-auto prose prose-sm max-w-none">
          {slide.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h3: ({ ...props }) => <h3 className="text-lg font-bold mb-3 mt-4 text-gray-800" {...props} />,
                p: ({ ...props }) => <p className="text-gray-600 leading-relaxed mb-4" {...props} />,
                ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-2 mb-4" {...props} />,
                li: ({ ...props }) => (
                  <li className="text-gray-700 marker:text-[accent]" style={{ color: "inherit" }} {...props}>
                    <span className="text-gray-700 font-medium">{(props as any).children}</span>
                  </li>
                ),
                strong: ({ ...props }) => <strong className="text-gray-900 font-bold" {...props} />,
              }}
            >
              {slide.content}
            </ReactMarkdown>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 italic gap-4">
              <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Slide content depends on visual data. Reference speaker notes or AI chat for details.</span>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div className="px-8 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-[9px] text-gray-400 font-mono">
          <div>TOP SECRET // INTERNAL USE ONLY</div>
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full" style={{ background: theme.accent }} />
            {slide.slide_index ? `PAGE ${slide.slide_index}` : "CD"}
          </div>
        </div>
      </div>
    </div>
  );
}


function PresentContent() {
  const params = useSearchParams();
  const sessionId = params.get("session") ?? "";

  const [slides, setSlides] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showPanel, setShowPanel] = useState(true);
  const [themeName, setThemeName] = useState("professional");

  useEffect(() => {
    // Load slides from localStorage (set by studio page)
    const raw = localStorage.getItem("cd_slides");
    if (raw) setSlides(JSON.parse(raw));

    // Load theme
    const savedTheme = localStorage.getItem("cd_theme") || "professional";
    setThemeName(savedTheme);

    if (!raw) {
      // Demo slide if no deck loaded yet
      setSlides([{
        id: "demo",
        type: "title",
        title: "Your Presentation",
        subtitle: "Client Presentation · Confidential",
        clientName: "Client",
        date: new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      }]);
    }
  }, []);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") setActiveIdx(p => Math.min(p + 1, slides.length - 1));
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") setActiveIdx(p => Math.max(p - 1, 0));
    if (e.key === "v") setShowPanel(p => !p);
  }, [slides.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const activeSlide = slides[activeIdx];
  const slideContext = activeSlide ? JSON.stringify(activeSlide) : "";

  return (
    <div className="h-screen bg-black flex flex-col font-sans">
      {/* Top bar */}
      <div className="h-10 bg-[#090d13] border-b border-[#1e2a3a] flex items-center px-4 gap-3 flex-shrink-0">
        <span className="text-kearney-gold font-serif font-bold tracking-tight">ConsultDeck Studio</span>
        <span className="text-gray-700 text-xs">|</span>
        <span className="text-gray-400 text-[10px] uppercase tracking-widest">{activeSlide?.clientName ?? "Presentation Preview"}</span>
        <div className="flex-1" />
        <button onClick={() => setShowPanel(p => !p)}
          className={`text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full border transition-all ${showPanel
            ? "bg-[#C8922A] border-[#C8922A] text-black shadow-lg shadow-[#C8922A]/20"
            : "border-[#1e2a3a] text-gray-500 hover:text-gray-400"
            }`}>
          {showPanel ? "Hide Assistant" : "Show Assistant"}
        </button>
        <div className="h-4 w-[1px] bg-gray-800 mx-2" />
        <span className="text-xs text-gray-500 font-mono">
          SLIDE <span className="text-white">{activeIdx + 1}</span> OF <span className="text-white">{slides.length}</span>
        </span>
      </div>

      {/* Main content area: Slide + Sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Slide canvas */}
        <div className="flex-1 flex items-center justify-center p-12 bg-[#05070a] relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500 blur-[100px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-500 blur-[100px]" />
          </div>

          <div className="w-full max-w-6xl aspect-[16/9] shadow-[0_0_100px_rgba(0,0,0,0.5)] relative group">
            <div className="absolute inset-0 border border-white/5 pointer-events-none z-20" />
            <div key={activeIdx} className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
              <SlideView slide={activeSlide} themeName={themeName} />
            </div>
          </div>
        </div>

        {/* AI Chat Sidebar */}
        {showPanel && (
          <div className="w-[400px] flex-shrink-0 border-l border-[#1e2a3a] shadow-2xl z-30">
            {activeSlide && (
              <AIChatPanel
                key={activeSlide.id}
                sessionId={sessionId}
                slideId={activeSlide.id}
                slideTitle={activeSlide.title}
                slideContext={slideContext}
              />
            )}
          </div>
        )}
      </div>


      {/* Navigation */}
      <div className="h-12 bg-[#090d13] border-t border-[#1e2a3a] flex items-center justify-between px-6 flex-shrink-0">
        <button onClick={() => setActiveIdx(p => Math.max(0, p - 1))} disabled={activeIdx === 0}
          className="text-sm text-gray-500 hover:text-white disabled:opacity-20 px-3 py-1 rounded border border-[#1e3050] transition-colors">← Prev</button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActiveIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === activeIdx ? "bg-kearney-gold scale-125" : "bg-gray-700 hover:bg-gray-600"}`} />
          ))}
        </div>
        <button onClick={() => setActiveIdx(p => Math.min(slides.length - 1, p + 1))} disabled={activeIdx === slides.length - 1}
          className="text-sm text-gray-500 hover:text-white disabled:opacity-20 px-3 py-1 rounded border border-[#1e3050] transition-colors">Next →</button>
      </div>
    </div>
  );
}

export default function PresentPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
      <PresentContent />
    </Suspense>
  );
}
