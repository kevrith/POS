import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, Monitor, Trash2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { isDesktopApp } from '../lib/desktopPrinter';
import { getStationToken, setStationToken } from '../lib/printBridge';
import { createPrintStation, listPrintStations, revokePrintStation } from '../lib/printQueue';

/** Print stations: computers on the shop network that deliver queued prints, signed in by a token instead of a person. */
export default function PrintStationsPanel() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const storeId = user?.storeId;
  const desktop = isDesktopApp();
  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<{ token: string; name: string; usedHere: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasLocalToken, setHasLocalToken] = useState(() => !!getStationToken());

  const { data: stations = [], error } = useQuery({
    queryKey: ['print-stations', storeId],
    queryFn: () => listPrintStations(storeId as string),
    enabled: !!storeId,
    refetchInterval: 10000,
  });

  const create = useMutation({
    mutationFn: ({ stationName, useHere }: { stationName: string; useHere: boolean }) =>
      createPrintStation(storeId as string, stationName).then((r) => ({ ...r, useHere })),
    onSuccess: ({ token, station, useHere }) => {
      if (useHere) { setStationToken(token); setHasLocalToken(true); }
      setNewToken({ token, name: station.name, usedHere: useHere });
      setName('');
      void qc.invalidateQueries({ queryKey: ['print-stations', storeId] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokePrintStation(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['print-stations', storeId] }); },
  });

  if (!storeId) return null;

  const trimmed = name.trim();

  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">Print stations</h4>
      <p className="text-xs text-gray-500 mb-3">
        A print station is a computer on the shop network that delivers prints the cloud server cannot reach (kitchen and
        receipt printers). It signs in with its own key, so nobody has to stay logged in on it.
      </p>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700 mb-2">
          <AlertCircle className="w-4 h-4" /> Could not load the print stations.
        </p>
      )}

      {stations.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg mb-3">
          {stations.map((s) => (
            <li key={s.id} className="p-3 flex items-center gap-3">
              <Monitor className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <p className="text-xs text-gray-500">{s.online ? 'Online' : s.lastSeenAt ? 'Offline' : 'Never connected'}</p>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.online ? 'bg-green-500' : 'bg-gray-300'}`}
                role="img"
                aria-label={s.online ? 'Online' : 'Offline'}
              />
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => { if (window.confirm(`Remove ${s.name}? It will stop delivering prints.`)) revoke.mutate(s.id); }}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                aria-label={`Remove ${s.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[180px] text-sm text-gray-700">
          Name for the new station
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Front counter"
            className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-gray-300"
          />
        </label>
        {desktop && (
          <button
            type="button"
            disabled={!trimmed || create.isPending}
            onClick={() => create.mutate({ stationName: trimmed, useHere: true })}
            className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Use this computer
          </button>
        )}
        <button
          type="button"
          disabled={!trimmed || create.isPending}
          onClick={() => create.mutate({ stationName: trimmed, useHere: false })}
          className="min-h-[44px] px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Create key only
        </button>
      </div>
      {create.error && <p role="alert" className="text-sm text-red-700 mt-2">Could not create the station.</p>}

      {desktop && hasLocalToken && (
        <p className="text-xs text-gray-600 mt-3 flex items-center justify-between gap-2">
          <span>This computer delivers prints with a station key.</span>
          <button
            type="button"
            className="underline"
            onClick={() => { setStationToken(null); setHasLocalToken(false); }}
          >
            Stop using it
          </button>
        </p>
      )}

      {newToken && (
        <div role="status" className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium">
            {newToken.usedHere ? `${newToken.name} is set up on this computer.` : `Key for ${newToken.name}`}
          </p>
          <p className="text-xs mt-1">
            {newToken.usedHere
              ? 'Copy the key if you want to use it on another computer. '
              : 'Paste it into the print station setting of the desktop app. '}
            It is shown only now and cannot be recovered; if lost, remove the station and create a new one.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all text-xs bg-white border border-amber-200 rounded px-2 py-1.5">{newToken.token}</code>
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(newToken.token).then(() => setCopied(true)); }}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-amber-300 hover:bg-amber-100"
              aria-label="Copy key"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button type="button" className="mt-2 text-xs underline" onClick={() => { setNewToken(null); setCopied(false); }}>
            I have saved it
          </button>
        </div>
      )}
    </div>
  );
}
