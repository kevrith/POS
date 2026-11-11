import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { canApproveAlone, overrideReady } from '../../lib/clinical';

export interface RestrictedApprovalInput {
  reason: string;
  managerPin?: string;
  patientName?: string;
  patientIdNumber?: string;
  prescriberName?: string;
}

/**
 * Shown when the till refuses a prescription-only or controlled medicine. The right way is to dispense it from a prescription;
 * this is the way round, for a manager's decision, and it is recorded (and a controlled drug is put on the register).
 */
export default function RestrictedSaleModal({
  medicines,
  controlled,
  role,
  busy,
  onCancel,
  onApprove,
}: {
  medicines: string[];
  controlled: boolean;
  role?: string;
  busy?: boolean;
  onCancel: () => void;
  onApprove: (a: RestrictedApprovalInput) => void;
}) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientIdNumber, setPatientIdNumber] = useState('');
  const [prescriberName, setPrescriberName] = useState('');
  const alone = canApproveAlone(role);
  const ready = overrideReady({ reason, pin }, role) && (!controlled || patientName.trim().length > 0);
  const input = 'w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Sell without a prescription">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"><ShieldAlert className="h-5 w-5 text-red-600" aria-hidden /> Needs a prescription</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
          {medicines.join(', ')} {medicines.length > 1 ? 'are' : 'is'} {controlled ? 'a controlled medicine' : 'sold on prescription only'}. The right way is to dispense it from Prescriptions.
          A manager can approve this sale without one. It is recorded{controlled ? ' and goes on the controlled-drug register' : ''}.
        </p>
        <div className="mt-4 space-y-2">
          <textarea className={input} rows={2} placeholder="Reason (for example: regular patient, prescriber phoned it through)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          {controlled && (
            <>
              <input className={input} placeholder="Sold to (patient name) *" aria-label="Sold to" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
              <input className={input} placeholder="Patient ID number" aria-label="Patient ID number" value={patientIdNumber} onChange={(e) => setPatientIdNumber(e.target.value)} />
              <input className={input} placeholder="Prescriber (if known)" aria-label="Prescriber" value={prescriberName} onChange={(e) => setPrescriberName(e.target.value)} />
            </>
          )}
          {!alone && <input className={input} type="password" inputMode="numeric" autoComplete="off" placeholder="Manager PIN" aria-label="Manager PIN" value={pin} onChange={(e) => setPin(e.target.value)} />}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="rounded-lg border py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200">Cancel</button>
          <button
            disabled={!ready || busy}
            onClick={() => onApprove({
              reason: reason.trim(),
              ...(alone ? {} : { managerPin: pin.trim() }),
              ...(controlled ? { patientName: patientName.trim(), patientIdNumber: patientIdNumber.trim() || undefined, prescriberName: prescriberName.trim() || undefined } : {}),
            })}
            className="rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Approve and sell'}
          </button>
        </div>
      </div>
    </div>
  );
}
