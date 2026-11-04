import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isConnected, subscribeToEvent, SocketEvents } from './socket';

const SOUND_KEY = 'kds-sound';

/** One short two-note chime. Built with WebAudio so there is no asset to ship or cache. */
function chime(ctx: AudioContext, urgent: boolean) {
  const notes = urgent ? [880, 660, 880] : [660, 880];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

/**
 * Keeps a kitchen screen live.
 *
 * The screen used to poll every ten seconds, which meant a ticket could sit
 * unseen for ten seconds and a cook never heard anything arrive. The server now
 * pushes ticket events; this refreshes the lists the moment one lands, chimes for
 * a new ticket, and raises a loud warning when a line is voided after it was sent
 * (so nobody keeps cooking something that is off the bill).
 *
 * Polling stays as the safety net, slower while the socket is up.
 */
export function useKdsRealtime(queryKeyPrefix: string) {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) === '1');
  const ctxRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  /** Browsers only let audio start after a tap, so this runs from the toggle button. */
  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    setSoundOn(next);
    localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    if (next) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          ctxRef.current ??= new Ctor();
          void ctxRef.current.resume();
          chime(ctxRef.current, false);
        }
      } catch { /* no audio device */ }
    }
  }, []);

  useEffect(() => {
    const play = (urgent: boolean) => {
      const ctx = ctxRef.current;
      if (!soundRef.current || !ctx) return;
      void ctx.resume().then(() => chime(ctx, urgent)).catch(() => {});
    };
    const refresh = () => void qc.invalidateQueries({ queryKey: [queryKeyPrefix] });

    let unsubscribe: Array<() => void> = [];
    const detach = () => { unsubscribe.forEach((u) => u()); unsubscribe = []; };
    const attach = () => {
      detach();
      unsubscribe = [
        subscribeToEvent(SocketEvents.KOT_CREATED, () => { refresh(); play(false); }),
        subscribeToEvent(SocketEvents.KOT_UPDATED, refresh),
        subscribeToEvent(SocketEvents.ORDER_UPDATED, refresh),
        subscribeToEvent(SocketEvents.KOT_VOIDED, (data) => {
          refresh();
          play(true);
          const lines = Array.isArray(data.lines) ? (data.lines as Array<{ name: string; quantity: number }>) : [];
          const what = lines.map((l) => `${l.quantity}x ${l.name}`).join(', ') || 'an item';
          toast.error(`VOID: ${what}${data.table ? ` - table ${String(data.table)}` : ''}. Stop making it.`, { duration: 60_000 });
        }),
      ];
    };

    // The socket is opened by the app shell after login, so it may not exist when
    // this mounts, and a reconnect can replace it. Re-attach on every transition
    // from down to up rather than assuming the first attach is still good.
    let wasUp = false;
    const check = () => {
      const up = isConnected();
      setLive(up);
      if (up && !wasUp) attach();
      if (!up) detach();
      wasUp = up;
    };
    const timer = setInterval(check, 2000);
    const first = setTimeout(check, 300);

    return () => {
      clearInterval(timer);
      clearTimeout(first);
      detach();
    };
  }, [qc, queryKeyPrefix]);

  return { live, soundOn, toggleSound };
}
