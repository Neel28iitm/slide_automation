"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAmbientListener, TranscriptEntry } from "@/app/hooks/useAmbientListener";

interface ChatMessage {
    id: string;
    role: "user" | "ai";
    text: string;
    sources?: { source: string; similarity?: number; title?: string }[];
    timestamp: number;
    type?: "rag" | "web_search" | "ambient";
}

interface AIChatPanelProps {
    sessionId: string;
    slideId: string;
    slideTitle: string;
    slideContext: string;
}

export function AIChatPanel({ sessionId, slideId, slideTitle, slideContext }: AIChatPanelProps) {
    const [language, setLanguage] = useState<"en" | "hi">("en");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [autoReply, setAutoReply] = useState(true); // Auto-reply to ambient speech
    const [customTone, setCustomTone] = useState<string | null>(null);
    const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);

    // Sync tone & voice from localStorage
    useEffect(() => {
        const savedTone = localStorage.getItem("cd_tone");
        setCustomTone(savedTone);
        const savedVoice = localStorage.getItem("cd_voice_id");
        setClonedVoiceId(savedVoice);
    }, []);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const isThinkingRef = useRef(false); // ref to avoid stale closure

    // Keep ref in sync with state
    useEffect(() => {
        isThinkingRef.current = isThinking;
    }, [isThinking]);

    // ── Ambient listener with auto-reply callback ──────────────────────────
    const onTranscriptEntry = useCallback((entry: TranscriptEntry) => {
        if (!autoReply || isThinkingRef.current) return;

        // Auto-send the transcript as a question to AI
        console.log("[AutoReply] Transcript detected, sending to AI:", entry.text);
        handleAutoReply(entry.text);
    }, [autoReply]);

    const { isListening, entries, startListening, stopListening, clearTranscript } =
        useAmbientListener({ language, onTranscript: onTranscriptEntry });

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [entries]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Build discussion context from recent transcript ────────────────────
    const getDiscussionContext = useCallback(() => {
        const recent = entries.slice(-10);
        if (recent.length === 0) return "";
        return "Recent discussion transcript:\n" + recent.map((e) => e.text).join(" ");
    }, [entries]);

    // ── Core AI query function ─────────────────────────────────────────────
    const queryAI = useCallback(async (question: string, source: "typed" | "ambient") => {
        if (!question.trim()) return;

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            text: question,
            timestamp: Date.now(),
            type: source === "ambient" ? "ambient" : undefined,
        };
        setMessages((prev) => [...prev, userMsg]);
        setIsThinking(true);

        try {
            let answer: string;
            let sources: ChatMessage["sources"];
            let msgType: "rag" | "web_search" = "rag";

            if (useWebSearch) {
                const res = await fetch("/api/rag/web-search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query: question,
                        slide_context: slideContext,
                        language,
                        custom_tone: customTone
                    }),
                });
                if (!res.ok) throw new Error("Web search failed");
                const data = await res.json();
                answer = data.answer;
                sources = data.sources?.map((s: { source: string; title?: string }) => ({
                    source: s.source || s.title || "Web",
                    title: s.title,
                }));
                msgType = "web_search";
            } else {
                const discussionCtx = getDiscussionContext();
                const enrichedContext = discussionCtx
                    ? `${slideContext}\n\n--- Ongoing Discussion ---\n${discussionCtx}`
                    : slideContext;

                const res = await fetch("/api/rag/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: sessionId,
                        slide_id: slideId,
                        slide_title: slideTitle,
                        slide_context: enrichedContext,
                        question,
                        language,
                        custom_tone: customTone,
                    }),
                });
                if (!res.ok) throw new Error("RAG query failed");
                const data = await res.json();
                answer = data.answer;
                sources = data.sources;
                msgType = "rag";
            }

            const aiMsg: ChatMessage = {
                id: `a-${Date.now()}`,
                role: "ai",
                text: answer,
                sources,
                timestamp: Date.now(),
                type: msgType,
            };
            setMessages((prev) => [...prev, aiMsg]);

            // ── Always play TTS for the AI answer ─────────────────────────
            try {
                console.log("[TTS] Speaking answer...");
                const ttsRes = await fetch("/api/voice/speak", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: answer,
                        language,
                        cloned_voice_id: clonedVoiceId
                    }),
                });
                if (ttsRes.ok) {
                    const audioBlob = await ttsRes.blob();
                    if (audioBlob.size > 0) {
                        const audioUrl = URL.createObjectURL(audioBlob);
                        const audio = new Audio(audioUrl);
                        audio.onended = () => URL.revokeObjectURL(audioUrl);
                        await audio.play();
                        console.log("[TTS] Playing audio...");
                    }
                } else {
                    console.error("[TTS] Failed:", ttsRes.status);
                }
            } catch (ttsErr) {
                console.error("[TTS] Error:", ttsErr);
            }
        } catch (err) {
            console.error("[AI Query] Error:", err);
            const errMsg: ChatMessage = {
                id: `e-${Date.now()}`,
                role: "ai",
                text: "Sorry, something went wrong. Please try again.",
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errMsg]);
        }

        setIsThinking(false);
    }, [sessionId, slideId, slideTitle, slideContext, language, useWebSearch, getDiscussionContext, clonedVoiceId, customTone]);

    // ── Auto-reply handler (called from onTranscript callback) ─────────────
    const handleAutoReply = useCallback((text: string) => {
        queryAI(text, "ambient");
    }, [queryAI]);

    // ── Manual send ────────────────────────────────────────────────────────
    const handleSend = () => {
        if (!input.trim() || isThinking) return;
        queryAI(input, "typed");
        setInput("");
    };

    // ── Minimized state ────────────────────────────────────────────────────
    if (!isExpanded) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0b0f18]/95 border-l border-[#1a2235]">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C8922A] to-[#a87520] flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                    title="Expand AI Panel"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                {isListening && (
                    <div className="mt-3 w-3 h-3 rounded-full bg-red-500 animate-pulse" title="Listening..." />
                )}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#0b0f18]/95 backdrop-blur-xl border-l border-[#1a2235] overflow-hidden">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a2235] bg-[#0d1220]/80">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#C8922A] to-[#a87520] flex items-center justify-center">
                            <span className="text-white text-xs font-bold">AI</span>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold text-white leading-none">ConsultDeck AI</h3>
                            <p className="text-[10px] text-gray-600 mt-0.5">Discussion Assistant</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {/* Language toggle */}
                        <div className="flex bg-[#111827] rounded-lg p-0.5">
                            {(["en", "hi"] as const).map((l) => (
                                <button
                                    key={l}
                                    onClick={() => setLanguage(l)}
                                    className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${language === l
                                        ? "bg-[#003366] text-white shadow-sm"
                                        : "text-gray-600 hover:text-gray-400"
                                        }`}
                                >
                                    {l === "en" ? "EN" : "\u0939\u093F"}
                                </button>
                            ))}
                        </div>
                        {/* Collapse */}
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-[#1a2235] transition-all"
                            title="Minimize"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Slide context + mode toggles */}
                <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 bg-[#111827] rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] text-[#C8922A]">{"\uD83C\uDFAF"}</span>
                        <span className="text-[10px] text-gray-500 truncate">{slideTitle}</span>
                    </div>
                    {/* Web Search toggle */}
                    <button
                        onClick={() => setUseWebSearch(!useWebSearch)}
                        className={`flex items-center gap-1 text-[9px] px-2 py-1.5 rounded-lg transition-all border ${useWebSearch
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                            : "bg-[#111827] text-gray-600 border-[#1e2a3a] hover:text-gray-400"
                            }`}
                        title={useWebSearch ? "Web Search ON" : "Click to enable web search"}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        {useWebSearch ? "WEB" : "RAG"}
                    </button>
                    {/* Auto-reply toggle */}
                    <button
                        onClick={() => setAutoReply(!autoReply)}
                        className={`flex items-center gap-1 text-[9px] px-2 py-1.5 rounded-lg transition-all border ${autoReply
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-[#111827] text-gray-600 border-[#1e2a3a] hover:text-gray-400"
                            }`}
                        title={autoReply ? "Auto-reply ON — AI responds to speech" : "Auto-reply OFF — transcript only"}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        </svg>
                        {autoReply ? "AUTO" : "MIC"}
                    </button>
                </div>
            </div>

            {/* ── Live Transcript Area ────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-[#1a2235]">
                <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                        {isListening ? (
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-[10px] text-red-400 font-medium">LIVE</span>
                                {autoReply && (
                                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md">
                                        AUTO-REPLY
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-[10px] text-gray-700">TRANSCRIPT</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={isListening ? stopListening : startListening}
                            className={`text-[10px] px-2.5 py-1 rounded-lg transition-all ${isListening
                                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                                : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30"
                                }`}
                        >
                            {isListening ? "\u23F9 Stop" : "\uD83C\uDF99 Listen"}
                        </button>
                        {entries.length > 0 && (
                            <button
                                onClick={clearTranscript}
                                className="text-[10px] px-1.5 py-1 text-gray-700 hover:text-gray-500 transition-colors"
                                title="Clear transcript"
                            >
                                {"\u2715"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Transcript entries */}
                <div className="max-h-[120px] overflow-y-auto px-4 pb-2 scroll-smooth">
                    {entries.length === 0 ? (
                        <p className="text-[10px] text-gray-800 italic py-1">
                            {isListening
                                ? "Listening to the discussion..."
                                : language === "en"
                                    ? 'Click "Listen" to capture the discussion'
                                    : '"Listen" \u0926\u092C\u093E\u090F\u0902 \u091A\u0930\u094D\u091A\u093E \u0915\u0948\u092A\u094D\u091A\u0930 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F'}
                        </p>
                    ) : (
                        entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="transcript-entry mb-1.5"
                                style={{ animation: "fadeIn 0.3s ease-out" }}
                            >
                                <span className="text-[9px] text-gray-700 font-mono mr-1.5">
                                    {new Date(entry.timestamp).toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                    })}
                                </span>
                                <span className="text-[11px] text-gray-400 leading-snug">{entry.text}</span>
                            </div>
                        ))
                    )}
                    <div ref={transcriptEndRef} />
                </div>
            </div>

            {/* ── Chat Messages ───────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1a2235] to-[#0d1220] flex items-center justify-center mb-3 border border-[#1e2a3a]">
                            <span className="text-lg">{"\uD83D\uDCAC"}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 max-w-[200px] leading-relaxed">
                            {language === "en"
                                ? `Ask anything about "${slideTitle}" or start listening`
                                : `"${slideTitle}" \u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u092A\u0942\u091B\u0947\u0902 \u092F\u093E Listen \u0926\u092C\u093E\u090F\u0902`}
                        </p>
                        <p className="text-[9px] text-gray-700 mt-2">
                            {language === "en"
                                ? 'With AUTO on, AI listens and replies in voice'
                                : 'AUTO \u0911\u0928 \u0939\u094B\u0928\u0947 \u092A\u0930 AI \u0938\u0941\u0928\u0947\u0917\u093E \u0914\u0930 \u092C\u094B\u0932\u0947\u0917\u093E'}
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        style={{ animation: "fadeIn 0.3s ease-out" }}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${msg.role === "user"
                                ? "bg-[#003366] text-blue-100 rounded-br-md"
                                : "bg-[#141c2b] text-gray-200 rounded-bl-md border border-[#1e2a3a]"
                                }`}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                <p className={`text-[10px] ${msg.role === "user" ? "text-blue-300" : "text-[#C8922A]"}`}>
                                    {msg.role === "user" ? "YOU" : "AI ASSISTANT"}
                                </p>
                                {msg.type === "web_search" && (
                                    <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-md">WEB</span>
                                )}
                                {msg.type === "ambient" && (
                                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md">
                                        {"\uD83C\uDF99"} VOICE
                                    </span>
                                )}
                            </div>
                            <p className="text-[12px] leading-relaxed">{msg.text}</p>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {msg.sources.map((s, i) => (
                                        <span
                                            key={i}
                                            className="text-[8px] bg-[#0b0f18] text-gray-600 px-1.5 py-0.5 rounded-md"
                                        >
                                            {s.title || (s.source ? s.source.split("/").pop() : "Source")}
                                            {s.similarity ? ` (${Math.round(s.similarity * 100)}%)` : ""}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isThinking && (
                    <div className="flex justify-start" style={{ animation: "fadeIn 0.2s ease-out" }}>
                        <div className="bg-[#141c2b] border border-[#1e2a3a] rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    {[0, 1, 2].map((i) => (
                                        <span
                                            key={i}
                                            className="w-2 h-2 rounded-full bg-[#C8922A]"
                                            style={{ animation: `bounceDot 1.2s ${i * 0.2}s ease-in-out infinite` }}
                                        />
                                    ))}
                                </div>
                                <span className="text-[9px] text-gray-500">
                                    {useWebSearch ? "Searching web..." : "Thinking..."}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* ── Input Area ──────────────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-[#1a2235] bg-[#0d1220]/60">
                <div className="flex gap-2 items-center">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                        placeholder={
                            useWebSearch
                                ? (language === "en" ? "Search the web..." : "\u0935\u0947\u092C \u092A\u0930 \u0916\u094B\u091C\u0947\u0902...")
                                : (language === "en" ? "Ask about this slide..." : "\u0907\u0938 \u0938\u094D\u0932\u093E\u0907\u0921 \u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u092A\u0942\u091B\u0947\u0902...")
                        }
                        disabled={isThinking}
                        className={`flex-1 bg-[#111827] border text-white text-xs px-3.5 py-2.5 rounded-xl outline-none placeholder-gray-700 disabled:opacity-40 transition-colors ${useWebSearch
                            ? "border-blue-500/30 focus:border-blue-400/50"
                            : "border-[#1e3050] focus:border-[#C8922A]/50"
                            }`}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isThinking}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#C8922A] to-[#a87520] text-white text-sm disabled:opacity-30 flex-shrink-0 hover:scale-105 transition-transform shadow-lg shadow-[#C8922A]/20"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
