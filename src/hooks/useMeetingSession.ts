import { useCallback, useRef, useState } from "react";

type SpeechRecognitionType = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: Event & { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((ev: Event) => void) | null;
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

export type StartSessionOptions = {
  /** When false (e.g. incognito), no mixed recording is captured — less confidential audio retained in memory. */
  recordMeeting?: boolean;
};

export function useMeetingSession() {
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mergedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const sessionActiveRef = useRef(false);

  const transcriptRef = useRef("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const interimThrottleRef = useRef<number | null>(null);
  const latestInterimRef = useRef("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const appendFinal = useCallback((text: string) => {
    const piece = text.trim();
    if (!piece) return;
    const next = (transcriptRef.current ? `${transcriptRef.current} ` : "") + piece;
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

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
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const chunk = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText) {
        if (interimThrottleRef.current != null) {
          window.clearTimeout(interimThrottleRef.current);
          interimThrottleRef.current = null;
        }
        latestInterimRef.current = "";
        appendFinal(finalText);
        setInterim("");
        return;
      }
      latestInterimRef.current = interimText.trim();
      if (interimThrottleRef.current != null) window.clearTimeout(interimThrottleRef.current);
      interimThrottleRef.current = window.setTimeout(() => {
        interimThrottleRef.current = null;
        setInterim(latestInterimRef.current);
      }, 110);
    };
    recognition.onerror = () => {
      if (interimThrottleRef.current != null) {
        window.clearTimeout(interimThrottleRef.current);
        interimThrottleRef.current = null;
      }
      latestInterimRef.current = "";
      setInterim("");
    };
    recognition.onend = () => {
      if (sessionActiveRef.current && recognitionRef.current === recognition) {
        window.setTimeout(() => {
          if (!sessionActiveRef.current || recognitionRef.current !== recognition) return;
          try {
            recognition.start();
          } catch {
            /* ignore */
          }
        }, 120);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [appendFinal]);

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    const recordMeeting = options?.recordMeeting !== false;

    setLastError(null);
    transcriptRef.current = "";
    setTranscript("");
    setInterim("");

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Screen capture was cancelled or failed.";
      setLastError(msg);
      throw e;
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      display.getTracks().forEach((t) => t.stop());
      const msg = e instanceof Error ? e.message : "Camera/microphone permission denied.";
      setLastError(msg);
      throw e;
    }

    displayStreamRef.current = display;
    micStreamRef.current = mic;

    if (recordMeeting) {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
      const dest = ctx.createMediaStreamDestination();

      const dAudio = display.getAudioTracks();
      if (dAudio.length) {
        try {
          ctx.createMediaStreamSource(new MediaStream(dAudio)).connect(dest);
        } catch {
          /* ignore */
        }
      }
      const mAudio = mic.getAudioTracks();
      if (mAudio.length) {
        try {
          ctx.createMediaStreamSource(new MediaStream(mAudio)).connect(dest);
        } catch {
          /* ignore */
        }
      }

      const videoTracks = display.getVideoTracks();
      const merged = new MediaStream([...videoTracks, ...dest.stream.getAudioTracks()]);
      mergedStreamRef.current = merged;

      chunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(merged, { mimeType: mime }) : new MediaRecorder(merged);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      /* Larger timeslice = fewer main-thread churn events while recording (smoother tab + speech). */
      rec.start(4000);
    } else {
      audioContextRef.current = null;
      mergedStreamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
    }

    sessionActiveRef.current = true;
    setIsSessionActive(true);
    startSpeech();

    return { displayStream: display, micStream: mic };
  }, [startSpeech]);

  const stopSession = useCallback(async () => {
    sessionActiveRef.current = false;
    stopSpeech();
    if (interimThrottleRef.current != null) {
      window.clearTimeout(interimThrottleRef.current);
      interimThrottleRef.current = null;
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

    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    micStreamRef.current = null;
    mergedStreamRef.current = null;

    try {
      await audioContextRef.current?.close();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;

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
