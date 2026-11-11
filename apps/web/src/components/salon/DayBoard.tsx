import { boardColumns, boardRange, clock, nairobiMinuteOfDay, overlappingKeys, type Appointment, type Stylist } from '../../lib/salon';

const PX_PER_MIN = 1.1;
const BLOCK: Record<string, string> = {
  BOOKED: 'border-blue-300 bg-blue-50 text-blue-900',
  CONFIRMED: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  IN_PROGRESS: 'border-amber-400 bg-amber-50 text-amber-900',
  COMPLETED: 'border-green-300 bg-green-50 text-green-900',
};

/** One column per stylist, a block per service, laid against the clock. Click a block to open the appointment. */
export default function DayBoard({
  appointments, stylists, isToday, onOpen,
}: { appointments: Appointment[]; stylists: Stylist[]; isToday: boolean; onOpen: (a: Appointment) => void }) {
  const columns = boardColumns(appointments, stylists);
  if (columns.length === 0) {
    return <p className="rounded-xl bg-white p-10 text-center text-gray-400 shadow dark:bg-gray-800">No stylists are set up yet, and nothing is booked. A manager can add stylists under Team.</p>;
  }
  const { fromMin, toMin } = boardRange(columns);
  const height = (toMin - fromMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = fromMin; m <= toMin; m += 60) hours.push(m);
  const now = nairobiMinuteOfDay(new Date());
  const showNow = isToday && now >= fromMin && now <= toMin;

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow dark:bg-gray-800" role="region" aria-label="Day board">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-10 w-14 flex-shrink-0 border-r bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="h-9 border-b dark:border-gray-700" />
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-gray-400" style={{ top: (m - fromMin) * PX_PER_MIN }}>{clock(m)}</span>
            ))}
          </div>
        </div>
        {columns.map((col) => {
          const clashing = overlappingKeys(col.blocks);
          return (
            <div key={col.key} className="w-44 flex-shrink-0 border-r last:border-r-0 dark:border-gray-700">
              <div className="flex h-9 items-center justify-center border-b px-2 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100">{col.name}</div>
              <div className="relative" style={{ height }}>
                {hours.map((m) => <div key={m} className="absolute inset-x-0 border-t border-gray-100 dark:border-gray-700" style={{ top: (m - fromMin) * PX_PER_MIN }} />)}
                {showNow && <div className="absolute inset-x-0 z-10 border-t-2 border-red-400" style={{ top: (now - fromMin) * PX_PER_MIN }} aria-label="Now" />}
                {col.blocks.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => onOpen(b.appointment)}
                    title={`${b.appointment.customerName}: ${b.label}, ${clock(b.startMin)}-${clock(b.endMin)}`}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs shadow-sm hover:shadow ${BLOCK[b.appointment.status] ?? 'border-gray-300 bg-gray-50 text-gray-700'} ${clashing.has(b.key) ? 'ring-2 ring-red-500' : ''}`}
                    style={{ top: (b.startMin - fromMin) * PX_PER_MIN, height: Math.max(22, (b.endMin - b.startMin) * PX_PER_MIN - 2) }}
                  >
                    <span className="block truncate font-semibold">{b.appointment.customerName}</span>
                    <span className="block truncate opacity-80">{b.label === b.appointment.customerName ? '' : b.label} {clock(b.startMin)}-{clock(b.endMin)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
