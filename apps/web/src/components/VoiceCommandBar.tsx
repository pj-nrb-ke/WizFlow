import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const COMMANDS: { patterns: RegExp[]; path: string; label: string }[] = [
  { patterns: [/inbox/i, /approval/i, /pending/i], path: "/inbox", label: "Open inbox" },
  { patterns: [/new request/i, /submit/i, /create request/i], path: "/submit", label: "New request" },
  { patterns: [/my request/i, /requests/i], path: "/requests", label: "My requests" },
  { patterns: [/workflow/i], path: "/workflows", label: "Workflows" },
  { patterns: [/analytics/i, /report/i, /kpi/i], path: "/analytics", label: "Analytics" },
  { patterns: [/setting/i], path: "/settings", label: "Settings" },
  { patterns: [/home/i, /dashboard/i], path: "/", label: "Home" },
];

function matchCommand(text: string): (typeof COMMANDS)[number] | null {
  const t = text.trim();
  for (const cmd of COMMANDS) {
    if (cmd.patterns.some((p) => p.test(t))) return cmd;
  }
  return null;
}

export function VoiceCommandBar() {
  const navigate = useNavigate();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [hint, setHint] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setHint("Voice commands are not supported in this browser.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setLastHeard(text);
      const cmd = matchCommand(text);
      if (cmd) {
        setHint(`Going to ${cmd.label}…`);
        navigate(cmd.path);
      } else {
        setHint(`Heard “${text}” — try “show inbox” or “new request”.`);
      }
    };
    rec.onerror = () => {
      setHint("Could not hear you. Try again.");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setHint("Listening… say “show inbox” or “new request”.");
  }, [navigate]);

  useEffect(() => () => stop(), [stop]);

  if (!supported) return null;

  return (
    <div className="wf-card p-4 mb-6 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm font-medium text-slate-800">Voice commands</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Say “show inbox”, “new request”, “my requests”, or “open analytics”.
        </p>
        {lastHeard && (
          <p className="text-xs text-slate-600 mt-1">
            Last: <span className="italic">{lastHeard}</span>
          </p>
        )}
        {hint && <p className="text-xs text-[rgb(var(--wf-brand-700))] mt-1">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => (listening ? stop() : start())}
        className={`px-4 py-2 text-sm rounded-lg border ${
          listening
            ? "border-red-300 bg-red-50 text-red-800"
            : "border-slate-200 hover:bg-slate-50"
        }`}
      >
        {listening ? "Stop listening" : "Start voice"}
      </button>
    </div>
  );
}
