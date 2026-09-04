import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceRecorderProps {
  onResult: (text: string) => void;
  disabled?: boolean;
}

// Check if SpeechRecognition is available (browser API, varies across browsers)
const SpeechRecognitionAPI =
  (window as unknown as Record<string, unknown>).SpeechRecognition ||
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
const supportsVoice = !!SpeechRecognitionAPI;

export default function VoiceRecorder({ onResult, disabled }: VoiceRecorderProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current as { abort?: () => void } | null;
      if (rec?.abort) rec.abort();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      const rec = recognitionRef.current as { abort?: () => void; stop?: () => void } | null;
      rec?.abort?.();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = SpeechRecognitionAPI as any;
      const recognition = new SpeechRecognition();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        setListening(false);
      };

      recognition.onerror = () => {
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening, onResult]);

  if (!supportsVoice) return null;

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
        listening
          ? "bg-red text-white animate-pulse"
          : "bg-surface text-slate hover:text-ink hover:bg-surface/80"
      } disabled:opacity-50`}
      title={listening ? "点击停止录音" : "语音输入"}
    >
      {listening ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="4" height="12" rx="1" />
          <rect x="14" y="6" width="4" height="12" rx="1" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      )}
    </button>
  );
}
