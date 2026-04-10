"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseFaceAuthReturn {
  /** Whether face-api.js models are loaded and ready */
  modelsLoaded: boolean;
  /** Whether models are currently loading */
  modelsLoading: boolean;
  /** Error message if model loading failed */
  modelError: string | null;
  /** Load face-api.js models (call once on mount) */
  loadModels: () => Promise<void>;
  /** Compute a 128-dimensional face descriptor from an HTMLImageElement or HTMLVideoElement */
  computeDescriptor: (
    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ) => Promise<Float32Array | null>;
  /** Compare two descriptors and return the Euclidean distance (lower = more similar) */
  compareDescriptors: (a: Float32Array, b: Float32Array) => number;
  /** Check if two descriptors are the same person (distance < threshold) */
  isSamePerson: (a: Float32Array, b: Float32Array, threshold?: number) => boolean;
}

const MODELS_URL = "/models";
const DEFAULT_THRESHOLD = 0.6; // typical threshold for face-api.js

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFaceAuth(): UseFaceAuthReturn {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Keep a ref to the faceapi module (dynamic import, only on client)
  const faceapiRef = useRef<typeof import("face-api.js") | null>(null);

  // Cleanup: nothing special needed

  const loadModels = useCallback(async () => {
    if (modelsLoaded || modelsLoading) return;
    setModelsLoading(true);
    setModelError(null);

    try {
      // Dynamic import to avoid SSR issues
      const faceapi = await import("face-api.js");
      faceapiRef.current = faceapi;

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ]);

      setModelsLoaded(true);
    } catch (err) {
      console.error("Failed to load face-api models:", err);
      setModelError("人脸识别模型加载失败，请刷新重试");
    } finally {
      setModelsLoading(false);
    }
  }, [modelsLoaded, modelsLoading]);

  const computeDescriptor = useCallback(
    async (
      input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
    ): Promise<Float32Array | null> => {
      const faceapi = faceapiRef.current;
      if (!faceapi) return null;

      const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return null;
      return detection.descriptor;
    },
    []
  );

  const compareDescriptors = useCallback(
    (a: Float32Array, b: Float32Array): number => {
      const faceapi = faceapiRef.current;
      if (!faceapi) {
        // Manual Euclidean distance fallback
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
          sum += (a[i] - b[i]) ** 2;
        }
        return Math.sqrt(sum);
      }
      return faceapi.euclideanDistance(
        Array.from(a),
        Array.from(b)
      );
    },
    []
  );

  const isSamePerson = useCallback(
    (a: Float32Array, b: Float32Array, threshold = DEFAULT_THRESHOLD): boolean => {
      return compareDescriptors(a, b) < threshold;
    },
    [compareDescriptors]
  );

  return {
    modelsLoaded,
    modelsLoading,
    modelError,
    loadModels,
    computeDescriptor,
    compareDescriptors,
    isSamePerson,
  };
}
