import { useEffect, useRef, useState } from 'react';

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts up to its value, and from the old value to a new one when it changes. A figure that arrives
 * from the server is something the eye should follow, not a flash. With reduced motion it simply shows the value.
 * `format` receives the current whole number (cents, for money).
 */
export function AnimatedValue({ value, format = String, duration = 700 }: { value: number; format?: (n: number) => string; duration?: number }) {
  // On the server (and in tests) there is nothing to animate, so the final value is what is rendered.
  const [shown, setShown] = useState(() => (typeof window === 'undefined' ? value : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reducedMotion() || from.current === value) { from.current = value; setShown(value); return; }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = Math.round(origin + (value - origin) * eased);
      from.current = current;
      setShown(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
