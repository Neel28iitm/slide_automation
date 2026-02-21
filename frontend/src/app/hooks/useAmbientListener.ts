"use client";
import { useState, useRef, useCallback } from "react";

export interface TranscriptEntry {
    id: string;
    text: string;
    timestamp: number;
}

interface UseAmbientListenerOptions {
    language: "en" | "hi";
    chunkIntervalMs?: number; // default 5000 (5 seconds)
    onTranscript?: (entry: TranscriptEntry) => void;
}

export function useAmbientListener(opts: UseAmbientListenerOptions) {
    const [isListening, setIsListening] = useState(false);
    const [entries, setEntries] = useState<TranscriptEntry[]>([]);

    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const idCounter = useRef(0);

    const chunkInterval = opts.chunkIntervalMs ?? 5000;

    // ── Send audio chunk to STT ──────────────────────────────────────────
    const transcribeChunk = useCallback(async (blob: Blob) => {
        console.log(`[AmbientListener] Audio chunk: ${blob.size} bytes, type: ${blob.type}`);

        if (blob.size < 1000) {
            console.log("[AmbientListener] Chunk too small, skipping");
            return;
        }

        try {
            const formData = new FormData();
            formData.append("audio", blob, "chunk.webm");
            formData.append("language", opts.language);

            console.log("[AmbientListener] Sending to /api/voice/transcribe...");
            const res = await fetch("/api/voice/transcribe", {
                method: "POST",
                body: formData,
            });

            console.log(`[AmbientListener] Response status: ${res.status}`);

            if (!res.ok) {
                const errorText = await res.text();
                console.error("[AmbientListener] STT error:", errorText);
                return;
            }

            const data = await res.json();
            console.log("[AmbientListener] STT response:", data);

            const text = data.transcript?.trim();
            if (!text) {
                console.log("[AmbientListener] Empty transcript, skipping");
                return;
            }

            const entry: TranscriptEntry = {
                id: `t-${Date.now()}-${idCounter.current++}`,
                text,
                timestamp: Date.now(),
            };

            setEntries((prev) => [...prev, entry]);
            opts.onTranscript?.(entry);
        } catch (err) {
            console.error("[AmbientListener] Fetch error:", err);
        }
    }, [opts.language]);

    // ── Harvest current recording, send it, restart recording ────────────
    const harvestAndRestart = useCallback(() => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state !== "recording") return;

        // Stop triggers ondataavailable + onstop
        recorder.stop();
    }, []);

    // ── Start continuous listening ───────────────────────────────────────
    const startListening = useCallback(async () => {
        try {
            console.log("[AmbientListener] Requesting microphone...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            console.log("[AmbientListener] Microphone granted");

            const startRecorder = () => {
                // Choose best supported MIME type
                const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                    ? "audio/webm;codecs=opus"
                    : MediaRecorder.isTypeSupported("audio/webm")
                        ? "audio/webm"
                        : "";

                console.log(`[AmbientListener] Using MIME type: ${mimeType || "default"}`);

                const recorderOpts: MediaRecorderOptions = {};
                if (mimeType) recorderOpts.mimeType = mimeType;

                const recorder = new MediaRecorder(stream, recorderOpts);
                recorderRef.current = recorder;
                chunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        chunksRef.current.push(e.data);
                        console.log(`[AmbientListener] Data chunk: ${e.data.size} bytes`);
                    }
                };

                recorder.onstop = () => {
                    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
                    console.log(`[AmbientListener] Recording stopped, total blob: ${blob.size} bytes`);
                    chunksRef.current = [];
                    transcribeChunk(blob);

                    // Restart if still supposed to be listening
                    if (streamRef.current && streamRef.current.active) {
                        startRecorder();
                    }
                };

                recorder.start();
                console.log("[AmbientListener] Recording started");
            };

            startRecorder();
            setIsListening(true);

            // Harvest every interval
            intervalRef.current = setInterval(() => {
                harvestAndRestart();
            }, chunkInterval);

        } catch (err) {
            console.error("[AmbientListener] Failed to start:", err);
            setIsListening(false);
        }
    }, [chunkInterval, transcribeChunk, harvestAndRestart]);

    // ── Stop listening ───────────────────────────────────────────────────
    const stopListening = useCallback(() => {
        console.log("[AmbientListener] Stopping...");
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
        }

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsListening(false);
    }, []);

    // ── Clear transcript ─────────────────────────────────────────────────
    const clearTranscript = useCallback(() => {
        setEntries([]);
    }, []);

    return {
        isListening,
        entries,
        startListening,
        stopListening,
        clearTranscript,
    };
}
