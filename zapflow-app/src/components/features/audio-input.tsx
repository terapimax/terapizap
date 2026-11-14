"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mic, Pause, Play, RotateCcw, Square, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { audioConversionSupported, formatDuration, toWhatsAppVoice, type VoiceResult } from "@/lib/audio";

export interface AudioInputValue extends VoiceResult {
  /** de onde veio: gravação feita aqui ou arquivo enviado */
  source: "record" | "file";
  /** nome sugerido para o item */
  suggestedTitle: string;
}

interface Props {
  onChange: (value: AudioInputValue | null) => void;
  disabled?: boolean;
}

type Mode = "record" | "file";
type Phase = "idle" | "recording" | "converting" | "ready";

const MAX_RECORD_SECONDS = 10 * 60;

/** Barras da forma de onda; `progress` (0–1) pinta a parte já tocada. */
export function Waveform({ peaks, progress = 0, className }: { peaks: number[]; progress?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-[3px] h-10 flex-1 min-w-0", className)} aria-hidden="true">
      {peaks.map((p, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-full min-w-[2px]", i / peaks.length < progress ? "bg-fg" : "bg-line")}
          style={{ height: `${Math.max(8, p * 100)}%` }}
        />
      ))}
    </div>
  );
}

function nowTitle(prefix: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix} ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AudioInput({ onChange, disabled }: Props) {
  const [mode, setMode] = useState<Mode>("record");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState<number[]>(() => Array(32).fill(0));
  const [result, setResult] = useState<AudioInputValue | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // gravação
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // reprodução da prévia
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const supported = typeof window === "undefined" ? true : audioConversionSupported();

  const stopCapture = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => () => {
    stopCapture();
    audioRef.current?.pause();
  }, [stopCapture]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const publish = (value: AudioInputValue | null) => {
    setResult(value);
    onChange(value);
    setPreviewUrl(value ? URL.createObjectURL(value.blob) : null);
    setPlaying(false);
    setProgress(0);
  };

  const reset = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    publish(null);
    setPhase("idle");
    setError(null);
    setSeconds(0);
  };

  const convert = async (blob: Blob, source: "record" | "file", title: string) => {
    setPhase("converting");
    setError(null);
    try {
      const r = await toWhatsAppVoice(blob);
      publish({ ...r, source, suggestedTitle: title });
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível converter o áudio.");
      setPhase("idle");
    }
  };

  // ── Gravar na hora ──
  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      return setError("Este navegador não permite gravar. Abra o painel pelo Chrome em localhost ou https.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);

      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        stopCapture();
        convert(blob, "record", nowTitle("Gravação"));
      };

      rec.start(250);
      startedAt.current = Date.now();
      setSeconds(0);
      setPhase("recording");
      tickRef.current = setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setSeconds(s);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        setLevel((prev) => [...prev.slice(1), rms]);
        if (s >= MAX_RECORD_SECONDS && rec.state === "recording") rec.stop();
      }, 80);
    } catch (e) {
      stopCapture();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError" ? "O acesso ao microfone foi bloqueado. Clique no cadeado ao lado do endereço e permita o microfone."
        : name === "NotFoundError" ? "Nenhum microfone foi encontrado neste computador."
        : "Não foi possível iniciar a gravação."
      );
      setPhase("idle");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  // ── Enviar arquivo ──
  const takeFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|ogg|opus|wav|webm|flac)$/i.test(file.name)) {
      return setError("Escolha um arquivo de áudio (mp3, m4a, wav, ogg...).");
    }
    convert(file, "file", file.name.replace(/\.[^.]+$/, ""));
  };

  const togglePlay = () => {
    if (!previewUrl) return;
    if (!audioRef.current || audioRef.current.src !== previewUrl) {
      audioRef.current?.pause();
      const a = new Audio(previewUrl);
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
      a.onended = () => { setPlaying(false); setProgress(0); };
      audioRef.current = a;
    }
    if (audioRef.current.paused) { audioRef.current.play(); setPlaying(true); }
    else { audioRef.current.pause(); setPlaying(false); }
  };

  if (!supported) {
    return (
      <div className="flex gap-3 p-4 rounded-xl bg-warn-soft text-warn text-sm" role="alert">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p>Este navegador não consegue converter áudio para o formato do WhatsApp. Abra o painel pelo Google Chrome ou pelo Microsoft Edge.</p>
      </div>
    );
  }

  const locked = disabled || phase === "recording" || phase === "converting";

  return (
    <div className="flex flex-col gap-4">
      {/* Escolha: gravar ou enviar */}
      <div role="group" aria-label="Como adicionar o áudio" className="grid grid-cols-2 bg-surface rounded-[10px] p-[3px] gap-0.5">
        {([["record", "Gravar agora", Mic], ["file", "Enviar arquivo", UploadCloud]] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={locked}
            onClick={() => { if (mode !== m) { reset(); setMode(m); } }}
            className={cn(
              "h-9 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:cursor-not-allowed",
              mode === m ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Estado: convertendo */}
      {phase === "converting" && (
        <div className="flex items-center gap-3 p-5 rounded-xl bg-surface" role="status">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold">Preparando como mensagem de voz…</p>
            <p className="text-xs text-muted">Convertendo para o formato do WhatsApp.</p>
          </div>
        </div>
      )}

      {/* Estado: pronto (prévia) */}
      {phase === "ready" && result && (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-surface">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pausar prévia" : "Ouvir prévia"}
              className="w-11 h-11 rounded-full bg-primary text-on-primary grid place-items-center shrink-0 cursor-pointer hover:opacity-90"
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <Waveform peaks={result.peaks} progress={progress} />
            <span className="text-sm tabular-nums text-muted shrink-0">{formatDuration(result.duration)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ok font-medium">Pronto: será enviado como mensagem de voz.</p>
            <button type="button" onClick={reset} disabled={disabled} className="text-xs font-semibold text-muted hover:text-fg flex items-center gap-1.5 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /> {result.source === "record" ? "Gravar de novo" : "Trocar arquivo"}
            </button>
          </div>
        </div>
      )}

      {/* Estado: gravando */}
      {phase === "recording" && (
        <div className="flex flex-col items-center gap-4 p-5 rounded-xl bg-surface" role="status">
          <div className="flex items-center gap-2 text-hot text-sm font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-hot animate-pulse" aria-hidden="true" /> Gravando
            <span className="tabular-nums text-fg ml-1">{formatDuration(seconds)}</span>
          </div>
          <div className="flex items-center gap-[3px] h-10 w-full" aria-hidden="true">
            {level.map((l, i) => (
              <span key={i} className="flex-1 rounded-full bg-fg min-w-[2px] transition-[height] duration-75" style={{ height: `${Math.max(8, l * 100)}%` }} />
            ))}
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="h-11 px-5 rounded-[10px] bg-hot text-white font-semibold text-sm flex items-center gap-2 cursor-pointer hover:opacity-90"
          >
            <Square className="w-4 h-4 fill-current" /> Parar gravação
          </button>
        </div>
      )}

      {/* Estado: parado, aguardando escolha */}
      {phase === "idle" && mode === "record" && (
        <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-dashed border-line text-center">
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            aria-label="Começar a gravar"
            className="w-16 h-16 rounded-full bg-hot text-white grid place-items-center cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            <Mic className="w-7 h-7" />
          </button>
          <div>
            <p className="text-sm font-semibold">Clique para começar a gravar</p>
            <p className="text-xs text-muted mt-0.5">O navegador vai pedir permissão para usar o microfone.</p>
          </div>
        </div>
      )}

      {phase === "idle" && mode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files[0]); }}
          className={cn("rounded-xl border border-dashed p-6 text-center transition-colors", dragOver ? "border-fg bg-surface" : "border-line")}
        >
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.webm,.flac" className="sr-only" aria-label="Escolher arquivo de áudio" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
          <UploadCloud className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden="true" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className="text-sm font-semibold underline underline-offset-2 cursor-pointer">
            Escolher arquivo
          </button>
          <p className="text-sm text-muted mt-1">ou arraste um áudio até aqui</p>
          <p className="text-xs text-muted mt-3">Aceita mp3, m4a, wav, ogg e outros. Convertemos para o formato do WhatsApp automaticamente.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="flex gap-2 text-sm text-hot">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
