import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, ApiError } from "../lib/api";
import { getToken } from "../lib/auth";

export type VoiceTranscript = {
  text: string;
  raw_text: string;
  language: string | null;
  voice_note_id: string;
  voice_note_ext: string;
};

const MicIcon = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {on ? <rect x="6" y="6" width="12" height="12" rx="2" /> : (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
      </>
    )}
  </svg>
);

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

/** Record a short voice note; on stop it is transcribed + grammar-polished server-side. */
export function VoiceNoteInput({
  onTranscript,
  disabled,
}: {
  onTranscript: (t: VoiceTranscript) => void;
  disabled?: boolean;
}) {
  const [supported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const upload = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      setStatus("Transcribing…");
      try {
        const ext = extFromMime(blob.type || "audio/webm");
        const fd = new FormData();
        fd.append("file", blob, `note.${ext}`);
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/v1/documents/transcribe`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          let detail = "Transcription failed";
          try {
            detail = (await res.json()).detail ?? detail;
          } catch {
            /* ignore */
          }
          throw new ApiError(detail, res.status, detail);
        }
        const data = (await res.json()) as VoiceTranscript;
        onTranscript(data);
        setStatus("Transcribed — review the comment below and edit if needed.");
      } catch (e) {
        setStatus(e instanceof ApiError ? e.detail ?? e.message : "Transcription failed.");
      } finally {
        setBusy(false);
      }
    },
    [onTranscript]
  );

  const start = useCallback(async () => {
    setStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size) void upload(blob);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setStatus("Recording… tap Stop when you're done.");
    } catch {
      setStatus("Microphone access was denied or is unavailable.");
    }
  }, [upload]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setRecording(false);
  }, []);

  useEffect(() => () => recRef.current?.stop(), []);

  if (!supported) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => (recording ? stop() : start())}
        disabled={busy || disabled}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
          recording
            ? "border-red-300 bg-red-50 text-red-800"
            : "border-slate-200 hover:bg-slate-50 text-slate-700"
        }`}
      >
        <MicIcon on={recording} />
        {recording ? "Stop recording" : busy ? "Working…" : "Record a voice note"}
      </button>
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </div>
  );
}
