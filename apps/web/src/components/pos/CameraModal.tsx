import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Camera, Keyboard } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

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
  [DecodeHintType.TRY_HARDER, true],
]);

export default function CameraModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const firedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [attempts, setAttempts] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;

    const reader = new BrowserMultiFormatReader(HINTS, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 300,
    });

    firedRef.current = false;

    reader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      videoRef.current,
      (result, err) => {
        if (firedRef.current) return;

        if (result) {
          const text = result.getText().trim();
          if (text) {
            firedRef.current = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
            if (videoRef.current) videoRef.current.srcObject = null;
            onScan(text);
            return;
          }
        }

        if (err) {
          if (err.name === 'NotFoundException') {
            // Normal — no barcode in frame yet
            setAttempts(n => n + 1);
            setStatus('scanning');
          } else {
            console.warn('[Camera scan error]', err.name, err.message);
          }
        }
      }
    ).then((controls) => {
      if (firedRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setStatus('scanning');
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      let friendly = `Camera error: ${msg}`;
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('NotGranted')) {
        friendly = 'Camera permission denied. Click the camera icon in your browser address bar to allow access.';
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound') || msg.includes('Requested device not found')) {
        friendly = 'No camera found on this device.';
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        friendly = 'Camera is in use by another app. Close other apps using the camera and try again.';
      }
      setError(friendly);
      setStatus('error');
    });

    return () => {
      firedRef.current = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    firedRef.current = true;
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  };

  const handleManualSubmit = () => {
    const val = manualInput.trim();
    if (!val) return;
    firedRef.current = true;
    controlsRef.current?.stop();
    controlsRef.current = null;
    onScan(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm">Scan Barcode</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowManual(v => !v)}
              title="Enter barcode manually"
              className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
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
