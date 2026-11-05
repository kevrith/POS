import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Camera, Keyboard, Zap } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// ── ZXing fallback (desktop browsers without the native BarcodeDetector) ──────
// TRY_HARDER is intentionally omitted: it makes ZXing attempt rotations/inversions
// on every frame, which noticeably slows 1D retail-barcode scanning.
const HINTS = new Map<DecodeHintType, any>([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
    BarcodeFormat.DATA_MATRIX,
  ]],
]);

// Formats for the native BarcodeDetector (Android/Chrome tablets) — same engine
// the mobile POS uses, so scanning is fast and accurate.
const NATIVE_FORMATS = [
  'ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code',
  'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix',
];

export default function CameraModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Stop all camera resources (native loop, ZXing controls, media tracks).
  function teardown() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function fire(text: string) {
    if (firedRef.current) return;
    const val = text.trim();
    if (!val) return;
    firedRef.current = true;
    teardown();
    onScan(val);
  }

  function mapCameraError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('NotGranted')) {
      return 'Camera permission denied. Click the camera icon in your browser address bar to allow access.';
    }
    if (msg.includes('NotFound') || msg.includes('DevicesNotFound') || msg.includes('Requested device not found')) {
      return 'No camera found on this device.';
    }
    if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
      return 'Camera is in use by another app. Close other apps using the camera and try again.';
    }
    return `Camera error: ${msg}`;
  }

  useEffect(() => {
    if (!videoRef.current) return;
    firedRef.current = false;
    let cancelled = false;

    const NativeDetector = (window as any).BarcodeDetector;

    async function startNative() {
      try {
        const detector = new NativeDetector({ formats: NATIVE_FORMATS });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled || firedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setEngine('native');
        setStatus('scanning');

        const tick = async () => {
          if (cancelled || firedRef.current) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              fire(codes[0].rawValue);
              return;
            }
          } catch {
            // Transient detect() failures (e.g. frame not ready) — keep looping.
          }
          setAttempts((n) => n + 1);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        // getUserMedia failures are real (permission/device); show them. A failure
        // constructing the detector falls back to ZXing instead.
        const msg = e instanceof Error ? e.message : String(e);
        if (/getUserMedia|Permission|NotAllowed|NotFound|NotReadable/i.test(msg)) {
          setError(mapCameraError(e));
          setStatus('error');
        } else {
          startZxing();
        }
      }
    }

    function startZxing() {
      const reader = new BrowserMultiFormatReader(HINTS, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 300,
      });
      setEngine('zxing');

      reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current!,
        (result, err) => {
          if (firedRef.current) return;
          if (result) {
            const text = result.getText().trim();
            if (text) {
              fire(text);
              return;
            }
          }
          if (err && err.name === 'NotFoundException') {
            setAttempts((n) => n + 1);
            setStatus('scanning');
          } else if (err) {
            console.warn('[Camera scan error]', err.name, err.message);
          }
        }
      ).then((controls) => {
        if (firedRef.current || cancelled) {
          controls.stop();
          return;
        }
        zxingControlsRef.current = controls;
        setStatus('scanning');
      }).catch((e: unknown) => {
        if (cancelled) return;
        setError(mapCameraError(e));
        setStatus('error');
      });
    }

    if (typeof NativeDetector !== 'undefined') {
      startNative();
    } else {
      startZxing();
    }

    return () => {
      cancelled = true;
      firedRef.current = true;
      teardown();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    firedRef.current = true;
    teardown();
    onClose();
  };

  const handleManualSubmit = () => {
    const val = manualInput.trim();
    if (!val) return;
    fire(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm">Scan Barcode</span>
            {engine === 'native' && (
              <span title="Fast native scanner" className="flex items-center gap-0.5 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                <Zap className="w-3 h-3" /> Fast
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowManual(v => !v)}
              title="Enter barcode manually"
              className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className="relative bg-black" style={{ minHeight: 260 }}>
          <video
            ref={videoRef}
            className="w-full block"
            style={{ maxHeight: 320 }}
            playsInline
            muted
            autoPlay
          />
          {/* Scan guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-52 h-36">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br" />
              {status === 'scanning' && (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-blue-400 opacity-80"
                  style={{ animation: 'scanline 1.5s ease-in-out infinite', top: '50%' }}
                />
              )}
            </div>
          </div>
          {/* Attempt counter — shows scanner is actively working */}
          {status === 'scanning' && attempts > 0 && (
            <div className="absolute bottom-2 right-2 text-xs text-white/50 tabular-nums">
              {attempts} frames
            </div>
          )}
        </div>

        {/* Status / Error */}
        {error ? (
          <div className="px-4 py-3 text-sm text-red-600 bg-red-50 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <p className="text-center text-xs text-gray-500 py-2 px-4">
            {status === 'starting' && 'Starting camera…'}
            {status === 'scanning' && 'Point camera at barcode — hold steady'}
          </p>
        )}

        {/* Manual fallback */}
        {showManual && (
          <div className="px-4 pb-4 border-t pt-3">
            <p className="text-xs text-gray-500 mb-2">Enter barcode manually:</p>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                placeholder="e.g. 6001020003001"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(-60px); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(60px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
