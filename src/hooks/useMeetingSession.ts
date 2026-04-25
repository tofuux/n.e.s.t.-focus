import { useCallback, useRef, useState } from "react";

type SpeechRecognitionErrorEvent = Event & { error: string };

type SpeechRecognitionType = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: Event & { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): SpeechRecognitionType | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionType; webkitSpeechRecognition?: SpeechRecognitionType };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

/** One combined camera + microphone stream (no tab/screen capture — much lighter on CPU/GPU). */
export type StartSessionOptions = {
  /** When false (e.g. incognito), no MediaRecorder — less work on the main thread. */
  recordMeeting?: boolean;
};

export function useMeetingSession() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const sessionActiveRef = useRef(false);

  const transcriptRef = useRef("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const interimRafRef = useRef<number | null>(null);
  const latestInterimRef = useRef("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  /** After benign Web Speech errors, wait longer before restart so Chrome does not stutter. */
  const speechRestartDelayRef = useRef(380);

  const appendFinal = useCallback((text: string) => {
    const piece = text.trim();
    if (!piece) return;
    const next = (transcriptRef.current ? `${transcriptRef.current} ` : "") + piece;
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  const flushInterimToState = useCallback(() => {
    interimRafRef.current = null;
    setInterim(latestInterimRef.current);
  }, []);

  const scheduleInterimFlush = useCallback(() => {
    if (interimRafRef.current != null) return;
    interimRafRef.current = window.requestAnimationFrame(() => {
      interimRafRef.current = null;
      flushInterimToState();
    });
  }, [flushInterimToState]);

  const stopSpeech = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (!r) return;
    r.onend = null;
    try {
      r.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const startSpeech = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
    setSpeechSupported(true);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    if ("maxAlternatives" in recognition) {
      (recognition as { maxAlternatives: number }).maxAlternatives = 1;
    }
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      speechRestartDelayRef.current = 380;
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const chunk = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText) {
        if (interimRafRef.current != null) {
          window.cancelAnimationFrame(interimRafRef.current);
          interimRafRef.current = null;
        }
        latestInterimRef.current = "";
        appendFinal(finalText);
        setInterim("");
        return;
      }
      latestInterimRef.current = interimText.trim();
      scheduleInterimFlush();
    };
    recognition.onerror = (event) => {
      const code = event.error;
      if (code === "not-allowed") {
        setLastError("Speech recognition blocked — allow microphone for this site in the address bar.");
        speechRestartDelayRef.current = 2500;
        return;
      }
      if (code === "no-speech" || code === "audio-capture" || code === "network") {
        speechRestartDelayRef.current = Math.min(Math.round(speechRestartDelayRef.current * 1.35), 2800);
      }
      if (interimRafRef.current != null) {
        window.cancelAnimationFrame(interimRafRef.current);
        interimRafRef.current = null;
      }
      latestInterimRef.current = "";
      setInterim("");
    };
    recognition.onend = () => {
      if (!sessionActiveRef.current || recognitionRef.current !== recognition) return;
      const delay = speechRestartDelayRef.current;
      window.setTimeout(() => {
        if (!sessionActiveRef.current || recognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch {
          speechRestartDelayRef.current = Math.min(Math.round(speechRestartDelayRef.current * 1.5), 3200);
        }
      }, delay);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [appendFinal, scheduleInterimFlush]);

  const startSession = useCallback(
    async (options?: StartSessionOptions) => {
      const recordMeeting = options?.recordMeeting !== false;

      setLastError(null);
      transcriptRef.current = "";
      setTranscript("");
      setInterim("");
      speechRestartDelayRef.current = 380;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 540 },
            frameRate: { ideal: 15, max: 24 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera/microphone permission denied.";
        setLastError(msg);
        throw e;
      }

      mediaStreamRef.current = stream;

      if (recordMeeting) {
        chunksRef.current = [];
        const mime = pickRecorderMime();
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        /* Larger slice = fewer main-thread events (smoother with speech + face sampling). */
        rec.start(6000);
      } else {
        recorderRef.current = null;
        chunksRef.current = [];
      }

      sessionActiveRef.current = true;
      setIsSessionActive(true);
      startSpeech();

      return { mediaStream: stream };
    },
    [startSpeech]
  );

  const stopSession = useCallback(async () => {
    sessionActiveRef.current = false;
    stopSpeech();
    if (interimRafRef.current != null) {
      window.cancelAnimationFrame(interimRafRef.current);
      interimRafRef.current = null;
    }
    latestInterimRef.current = "";
    setInterim("");

    const rec = recorderRef.current;
    recorderRef.current = null;

    const blob = await new Promise<Blob | null>((resolve) => {
      if (!rec || rec.state === "inactive") {
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const type = rec.mimeType || "video/webm";
        const b = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        resolve(b);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    setIsSessionActive(false);
    const text = transcriptRef.current;
    transcriptRef.current = "";
    setTranscript("");
    return { blob, transcript: text };
  }, [stopSpeech]);

  const getSnippetForAi = useCallback((maxChars = 6000) => {
    const t = transcriptRef.current.trim();
    if (t.length <= maxChars) return t;
    return t.slice(-maxChars);
  }, []);

  return {
    isSessionActive,
    transcript,
    interim,
    speechSupported,
    lastError,
    startSession,
    stopSession,
    getSnippetForAi,
  };
}
