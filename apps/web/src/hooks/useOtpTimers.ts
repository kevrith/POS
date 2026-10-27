import { useCallback, useEffect, useState } from 'react';

/**
 * The two clocks an OTP screen has to show: how long the code is still good for,
 * and when the customer may ask for another one. Both come from the server's
 * request-otp response, so the numbers on screen are the ones actually enforced
 * rather than constants copied into each client and left to drift.
 *
 * Without these the customer sees a code box with no deadline, and a resend
 * button that answers "please wait 47s" only after they have already pressed it.
 */
export function useOtpTimers() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null && resendAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt, resendAt]);

  /** Call with the server's `expiresInSeconds` / `resendInSeconds`. */
  const start = useCallback((expiresInSeconds = 600, resendInSeconds = 60) => {
    const t = Date.now();
    setNow(t);
    setExpiresAt(t + expiresInSeconds * 1000);
    setResendAt(t + resendInSeconds * 1000);
  }, []);

  const clear = useCallback(() => {
    setExpiresAt(null);
    setResendAt(null);
  }, []);

  const secondsLeft = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendIn = resendAt === null ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));

  return {
    start,
    clear,
    /** Seconds until the code dies, as `m:ss`. */
    countdown: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
    secondsLeft,
    /** Seconds until a resend is allowed; 0 means the button is live. */
    resendIn,
    expired: expiresAt !== null && secondsLeft === 0,
  };
}
