import { useEffect, useRef, useState, type RefObject } from "react";
import { mean, stressScoreFromExpressions } from "@/lib/moodStress";

const MODEL_URI = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

type FaceApiModule = typeof import("face-api.js");

export type UseVideoStressMonitorOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** When false, sampling stops. */
  enabled: boolean;
  stressThreshold?: number;
  windowSize?: number;
  sampleIntervalMs?: number;
  /** Minimum frames in the rolling window before auto-trigger is allowed. */
  minSamplesForTrigger?: number;
  /** Suppress repeated calm API calls while stress stays high. */
  cooldownMs?: number;
  onHighStress: () => void;
};

export function useVideoStressMonitor({
  videoRef,
  enabled,
  stressThreshold = 0.3,
  windowSize = 10,
  sampleIntervalMs = 1600,
  minSamplesForTrigger = 5,
  cooldownMs = 75_000,
  onHighStress,
}: UseVideoStressMonitorOptions) {
  const [modelsReady, setModelsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** One state blob per tick to avoid multiple React commits competing with video + speech. */
  const [stressDisplay, setStressDisplay] = useState<{
    avgStress: number | null;
    lastFrameStress: number | null;
    windowLen: number;
  }>({ avgStress: null, lastFrameStress: null, windowLen: 0 });

  const stressWindowRef = useRef<number[]>([]);
  const lastTriggerRef = useRef(0);
  const faceapiRef = useRef<FaceApiModule | null>(null);
  const onHighStressRef = useRef(onHighStress);
  onHighStressRef.current = onHighStress;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const faceapi = await import("face-api.js");
        if (cancelled) return;
        faceapiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URI),
        ]);
        if (!cancelled) setModelsReady(true);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load face mood models");
          setModelsReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    stressWindowRef.current = [];
    setStressDisplay({ avgStress: null, lastFrameStress: null, windowLen: 0 });
    lastTriggerRef.current = 0;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !modelsReady) return;

    let busy = false;
    const faceapi = faceapiRef.current;
    if (!faceapi) return;

    const detectorOpts = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });

    const tick = async () => {
      if (busy) return;
      const video = videoRef.current;
      const fa = faceapiRef.current;
      if (!fa || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      busy = true;
      try {
        const det = await fa.detectSingleFace(video, detectorOpts).withFaceExpressions();
        if (!det) return;

        const stress = stressScoreFromExpressions(det.expressions);
        const w = stressWindowRef.current;
        w.push(stress);
        if (w.length > windowSize) w.shift();

        const avg = mean(w);
        setStressDisplay({ avgStress: avg, lastFrameStress: stress, windowLen: w.length });

        const now = Date.now();
        if (
          w.length >= minSamplesForTrigger &&
          avg > stressThreshold &&
          now - lastTriggerRef.current >= cooldownMs
        ) {
          lastTriggerRef.current = now;
          onHighStressRef.current();
        }
      } catch {
        /* ignore frame errors (e.g. TF warmup) */
      } finally {
        busy = false;
      }
    };

    const id = window.setInterval(() => void tick(), sampleIntervalMs);
    return () => window.clearInterval(id);
  }, [
    enabled,
    modelsReady,
    videoRef,
    stressThreshold,
    windowSize,
    sampleIntervalMs,
    minSamplesForTrigger,
    cooldownMs,
  ]);

  const { avgStress, lastFrameStress, windowLen } = stressDisplay;
  const isHigh =
    avgStress !== null &&
    avgStress > stressThreshold &&
    windowLen >= minSamplesForTrigger;

  return {
    modelsReady,
    loadError,
    avgStress,
    lastFrameStress,
    isHighStress: Boolean(isHigh),
    isMonitoring: enabled && modelsReady,
  };
}
