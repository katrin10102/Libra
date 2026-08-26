import React, { useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import {
  getNativeBarcodeDetector,
  decodeCanvasWithZXing,
  decodeBarcodeFromFile,
  cleanBarcodeResult
} from '../../services/BarcodeScannerService';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  t: (key: string) => string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  t
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDetectedRef = useRef(false);

  // Stop camera and cleanup
  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleSuccess = (code: string) => {
    if (isDetectedRef.current) return;
    isDetectedRef.current = true;

    try {
      if (navigator.vibrate) navigator.vibrate(100);
    } catch {}

    stopCamera();
    onDetected(code);
  };

  const toggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const newState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: newState }]
        });
        setTorchOn(newState);
      } catch (err) {
        console.warn('Torch toggle not supported:', err);
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingPhoto(true);
    setErrorMsg(null);

    try {
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        handleSuccess(code);
      } else {
        setErrorMsg(t('bookForm.isbnScanPhotoError'));
      }
    } catch (err) {
      console.error('File scan error:', err);
      setErrorMsg(t('bookForm.isbnScanPhotoError'));
    } finally {
      setIsProcessingPhoto(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    isDetectedRef.current = false;
    setIsLoading(true);
    setErrorMsg(null);
    setTorchOn(false);

    let isMounted = true;

    const startCamera = async () => {
      try {
        // Priority constraints: back camera, ideal 1280x720 (standard HD for crisp 1D barcode lines)
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        await video.play();

        setIsLoading(false);

        // Prepare detection engines
        const nativeDetector = await getNativeBarcodeDetector();
        const canvas = canvasRef.current || document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let frameCount = 0;

        const scanFrame = async () => {
          if (!isMounted || isDetectedRef.current || !video || video.readyState < 2) {
            if (isMounted && !isDetectedRef.current) {
              animFrameRef.current = requestAnimationFrame(scanFrame);
            }
            return;
          }

          frameCount++;

          // 1. Try native BarcodeDetector on video element every frame (super fast hardware accelerated)
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(video);
              if (barcodes && barcodes.length > 0) {
                for (const b of barcodes) {
                  const cleaned = cleanBarcodeResult(b.rawValue);
                  if (cleaned && (cleaned.length === 10 || cleaned.length === 13 || cleaned.length >= 8)) {
                    handleSuccess(cleaned);
                    return;
                  }
                }
              }
            } catch {}
          }

          // 2. Fallback: Software ZXing / Canvas pass every 4 frames (~15fps)
          if (frameCount % 4 === 0 && ctx) {
            try {
              // Scale video down to 640x360 for high-speed JS decoding
              const vw = video.videoWidth || 640;
              const vh = video.videoHeight || 480;
              const targetW = 640;
              const targetH = Math.round((vh / vw) * 640);

              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }

              ctx.drawImage(video, 0, 0, targetW, targetH);

              // Decode center scan band (middle 60% horizontally and 40% vertically)
              const zxResult = decodeCanvasWithZXing(canvas);
              if (zxResult) {
                const cleaned = cleanBarcodeResult(zxResult);
                if (cleaned && (cleaned.length === 10 || cleaned.length === 13 || cleaned.length >= 8)) {
                  handleSuccess(cleaned);
                  return;
                }
              }
            } catch {}
          }

          if (isMounted && !isDetectedRef.current) {
            animFrameRef.current = requestAnimationFrame(scanFrame);
          }
        };

        animFrameRef.current = requestAnimationFrame(scanFrame);
      } catch (err: any) {
        console.error('Camera startup error:', err);
        if (isMounted) {
          setIsLoading(false);
          setErrorMsg(t('bookForm.isbnScanError'));
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight">
                {t('bookForm.isbnScanMode')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                EAN-13 / ISBN-13 / ISBN-10
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          <canvas ref={canvasRef} className="hidden" />

          {/* Target Reticle / Barcode guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="relative w-[85%] h-[40%] rounded-2xl border-2 border-indigo-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-indigo-500 rounded-tl" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-indigo-500 rounded-tr" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-indigo-500 rounded-bl" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-indigo-500 rounded-br" />

              {/* Animated laser line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
            </div>
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center gap-3 text-white">
              <Loader2 size={32} className="animate-spin text-indigo-400" />
              <span className="text-sm font-medium">{t('app.loading')}...</span>
            </div>
          )}

          {/* Flashlight toggle */}
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md transition-all ${
                torchOn
                  ? 'bg-amber-400 text-gray-900 shadow-lg scale-105'
                  : 'bg-black/40 text-white hover:bg-black/60'
              }`}
            >
              <Flashlight size={18} />
            </button>
          )}
        </div>

        {/* Error or Warning */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setIsLoading(true);
                // Trigger re-mount camera
                stopCamera();
                const v = videoRef.current;
                if (v) v.srcObject = null;
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-1 font-bold text-[11px]"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        {/* Controls and Photo Upload Option */}
        <div className="p-4 space-y-3 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-800">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoUpload}
          />

          <button
            type="button"
            disabled={isProcessingPhoto}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/80 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-2xl active:scale-95 transition-all shadow-sm"
          >
            {isProcessingPhoto ? (
              <>
                <Loader2 size={16} className="animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>{t('app.loading')}...</span>
              </>
            ) : (
              <>
                <Upload size={16} className="text-indigo-600 dark:text-indigo-400" />
                <span>{t('bookForm.isbnScanPhoto')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
