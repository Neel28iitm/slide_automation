"use client";
import { useState, useRef, useCallback } from "react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface UseVoiceRAGOptions {
  sessionId: string;
  slideId: string;
  slideTitle: string;
  slideContext: string;
  language: "en" | "hi";
  onTranscript?: (text: string) => void;
  onAnswer?: (text: string) => void;
}

export function useVoiceRAG(opts: UseVoiceRAGOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Start recording ──────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    setError("");
    setAnswer("");
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };

      recorder.start();
      setState("listening");
    } catch (e) {
      setError("Microphone access denied");
      setState("error");
    }
  }, [opts]);

  // ── Stop recording ───────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("thinking");
    }
  }, []);

  // ── Process audio → STT → RAG → TTS ─────────────────────────────────────
  const processAudio = useCallback(async (blob: Blob) => {
    setState("thinking");
    try {
      // 1. STT — send audio to backend Whisper
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("language", opts.language);

      const sttRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!sttRes.ok) throw new Error("Transcription failed");
      const { transcript: text } = await sttRes.json();

      setTranscript(text);
      opts.onTranscript?.(text);

      if (!text.trim()) {
        setState("idle");
        return;
      }

      // 2. RAG query
      const ragRes = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: opts.sessionId,
          slide_id: opts.slideId,
          slide_title: opts.slideTitle,
          slide_context: opts.slideContext,
          question: text,
          language: opts.language,
        }),
      });
      if (!ragRes.ok) throw new Error("RAG query failed");
      const { answer: answerText, sources: srcs } = await ragRes.json();

      setAnswer(answerText);
      setSources(srcs);
      opts.onAnswer?.(answerText);

      // 3. TTS — play answer aloud
      setState("speaking");
      const clonedVoiceId = localStorage.getItem("cd_voice_id");
      const ttsRes = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answerText, language: opts.language, cloned_voice_id: clonedVoiceId }),
      });
      if (!ttsRes.ok) throw new Error("TTS failed");

      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        audio.play().catch(reject);
      });

      URL.revokeObjectURL(audioUrl);
      setState("idle");

    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [opts]);

  // ── Text-only query (no voice input) ─────────────────────────────────────
  const askText = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setState("thinking");
    setAnswer("");
    setSources([]);
    setTranscript(question);

    try {
      const ragRes = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: opts.sessionId,
          slide_id: opts.slideId,
          slide_title: opts.slideTitle,
          slide_context: opts.slideContext,
          question,
          language: opts.language,
        }),
      });
      const { answer: answerText, sources: srcs } = await ragRes.json();
      setAnswer(answerText);
      setSources(srcs);
      opts.onAnswer?.(answerText);

      // TTS
      setState("speaking");
      const clonedVoiceId = localStorage.getItem("cd_voice_id");
      const ttsRes = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answerText, language: opts.language, cloned_voice_id: clonedVoiceId }),
      });
      const audioBlob = await ttsRes.blob();
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      await audio.play();

    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [opts]);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    setState("idle");
  }, []);

  const reset = () => {
    setState("idle");
    setTranscript("");
    setAnswer("");
    setSources([]);
    setError("");
  };

  return {
    state, transcript, answer, sources, error,
    startListening, stopListening, askText, stopSpeaking, reset,
  };
}
