import { type RefObject } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  cameraError: string | null;
  onClose: () => void;
}

export default function CameraModal({ videoRef, cameraError, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold">Scan Barcode</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative bg-black">
          <video ref={videoRef} className="w-full" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-4 border-blue-400 rounded-lg opacity-70" />
          </div>
        </div>
        {cameraError && (
          <div className="px-4 py-3 text-sm text-red-600 bg-red-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {cameraError}
          </div>
        )}
        <p className="text-center text-xs text-gray-500 py-2">Point camera at barcode to scan automatically</p>
      </div>
    </div>
  );
}
