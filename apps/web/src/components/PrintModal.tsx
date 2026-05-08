import { useState } from 'react';
import { X, Printer, Bluetooth, Usb, Globe, Wifi } from 'lucide-react';
import {
  printToBrowser, printToUSB, printToBluetooth, openDrawerViaUSB,
  printToStarWebPRNT, printToEpsonEPOS,
  type ReceiptData, type StarPrinterConfig, type EpsonPrinterConfig,
} from '../lib/printer';

interface PrintModalProps {
  receipt: ReceiptData;
  onClose: () => void;
  enableCashDrawer?: boolean;
}

export default function PrintModal({ receipt, onClose, enableCashDrawer = false }: PrintModalProps) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [drawerMsg, setDrawerMsg] = useState('');

  // Read saved network printer config from localStorage
  const savedStar: StarPrinterConfig | null = (() => {
    try { const s = localStorage.getItem('star-printer'); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  const savedEpson: EpsonPrinterConfig | null = (() => {
    try { const s = localStorage.getItem('epson-printer'); return s ? JSON.parse(s) : null; } catch { return null; }
  })();

  const handlePrint = async (method: 'browser' | 'usb' | 'bluetooth' | 'star' | 'epson') => {
    setPrinting(true);
    setError('');
    try {
      switch (method) {
        case 'browser':   printToBrowser(receipt); break;
        case 'usb':       await printToUSB(receipt, enableCashDrawer); break;
        case 'bluetooth': await printToBluetooth(receipt, enableCashDrawer); break;
        case 'star':      await printToStarWebPRNT(savedStar!, receipt); break;
        case 'epson':     await printToEpsonEPOS(savedEpson!, receipt); break;
      }
      setTimeout(onClose, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setPrinting(false);
    }
  };

  const handleOpenDrawer = async () => {
    setDrawerMsg('');
    try {
      await openDrawerViaUSB();
      setDrawerMsg('Cash drawer opened');
    } catch {
      setDrawerMsg('Could not open drawer — check USB connection');
    }
    setTimeout(() => setDrawerMsg(''), 3000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">Print Receipt</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={() => handlePrint('browser')}
            disabled={printing}
            className="w-full flex items-center gap-3 p-4 border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <Globe className="w-6 h-6 text-blue-600" />
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-800">Browser Print</div>
              <div className="text-xs text-gray-500">Print using system printer</div>
            </div>
          </button>

          <button
            onClick={() => handlePrint('usb')}
            disabled={printing}
            className="w-full flex items-center gap-3 p-4 border-2 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            <Usb className="w-6 h-6 text-green-600" />
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-800">USB Thermal (ESC/POS)</div>
              <div className="text-xs text-gray-500">Direct ESC/POS via WebUSB</div>
            </div>
          </button>

          <button
            onClick={() => handlePrint('bluetooth')}
            disabled={printing}
            className="w-full flex items-center gap-3 p-4 border-2 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            <Bluetooth className="w-6 h-6 text-purple-600" />
            <div className="text-left flex-1">
              <div className="font-semibold text-gray-800">Bluetooth Printer</div>
              <div className="text-xs text-gray-500">Pair with Bluetooth device</div>
            </div>
          </button>

          {savedStar && (
            <button
              onClick={() => handlePrint('star')}
              disabled={printing}
              className="w-full flex items-center gap-3 p-4 border-2 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              <Wifi className="w-6 h-6 text-orange-500" />
              <div className="text-left flex-1">
                <div className="font-semibold text-gray-800">Star WebPRNT</div>
                <div className="text-xs text-gray-500">{savedStar.host}:{savedStar.port ?? 8008}</div>
              </div>
            </button>
          )}

          {savedEpson && (
            <button
              onClick={() => handlePrint('epson')}
              disabled={printing}
              className="w-full flex items-center gap-3 p-4 border-2 rounded-xl hover:border-cyan-500 hover:bg-cyan-50 transition-colors disabled:opacity-50"
            >
              <Wifi className="w-6 h-6 text-cyan-600" />
              <div className="text-left flex-1">
                <div className="font-semibold text-gray-800">Epson ePOS</div>
                <div className="text-xs text-gray-500">{savedEpson.host}</div>
              </div>
            </button>
          )}

          {printing && (
            <div className="text-center py-2 text-sm text-gray-500">
              <Printer className="w-5 h-5 animate-pulse mx-auto mb-1" />
              Printing...
            </div>
          )}

          {enableCashDrawer && (
            <div className="border-t pt-3 mt-1">
              <button
                onClick={handleOpenDrawer}
                className="w-full flex items-center gap-3 p-3 border-2 border-dashed rounded-xl hover:border-yellow-400 hover:bg-yellow-50 transition-colors text-gray-600"
              >
                <span className="text-xl">🗄️</span>
                <div className="text-left flex-1">
                  <div className="font-semibold text-sm">Open Cash Drawer</div>
                  <div className="text-xs text-gray-400">Sends pulse via USB printer (RJ11)</div>
                </div>
              </button>
              {drawerMsg && (
                <p className="text-xs text-center mt-1 text-gray-500">{drawerMsg}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
