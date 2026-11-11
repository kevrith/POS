import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { Badge, Card, StatTile } from '../../components/ui';
import { litres } from './money';
import { PAYMENT_LABEL, type ShiftSummary } from './types';

/** Shown by the live shift and by a closed shift in the history: the same numbers, laid out the same way. */
export default function ShiftSummaryView({ summary, onTest }: { summary: ShiftSummary; onTest?: (nozzleId: string, label: string) => void }) {
  const closed = summary.shift.status === 'CLOSED';
  const { issues } = summary;
  const clean = closed && issues.unrecordedNozzles === 0 && issues.cashShortAttendants === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 min-[500px]:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Litres sold" value={litres(summary.totalLitres)} />
        <StatTile label="Sales" value={formatKES(summary.totalRevenueCents)} note={`${summary.totalTransactions} transaction${summary.totalTransactions === 1 ? '' : 's'}`} />
        <StatTile label="Litres unaccounted" value={closed ? litres(summary.byNozzle.reduce((t, n) => t + Math.max(0, n.unrecordedLitres ?? 0), 0)) : 'at close'} tone={closed && issues.unrecordedNozzles > 0 ? 'danger' : 'neutral'} note={closed ? `${issues.unrecordedNozzles} nozzle${issues.unrecordedNozzles === 1 ? '' : 's'} flagged` : 'Compared with the meters'} />
        <StatTile label="Cash difference" value={closed ? formatKES(summary.byAttendant.reduce((t, a) => t + (a.cashVarianceCents ?? 0), 0)) : 'at close'} tone={closed && issues.cashShortAttendants > 0 ? 'danger' : 'neutral'} note={closed ? `${issues.cashShortAttendants} attendant${issues.cashShortAttendants === 1 ? '' : 's'} short` : 'Compared with cash sales'} />
      </div>

      {closed && (
        <div role="status" className={`rounded-lg px-4 py-3 flex items-start gap-3 text-sm ${clean ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
          {clean ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden />}
          <p>
            {clean
              ? 'Every litre through the meters was rung up and every attendant handed in the cash they took.'
              : 'This shift has differences to look into. Fuel through a meter that nobody rang up, or cash short of what was sold, is shown in red below.'}
            {summary.voidedCount > 0 && ` ${summary.voidedCount} sale${summary.voidedCount === 1 ? ' was' : 's were'} voided (${litres(summary.voidedLitres)}).`}
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-gray-900">Meters</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Nozzle</th>
                <th className="text-right px-3 py-2">Opening</th>
                <th className="text-right px-3 py-2">{closed ? 'Closing' : 'Should read now'}</th>
                <th className="text-right px-3 py-2">Sold</th>
                <th className="text-right px-3 py-2">Tested</th>
                {closed && <th className="text-right px-3 py-2">Unrecorded</th>}
                {onTest && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {summary.byNozzle.map((n) => {
                const bad = n.flag === 'UNRECORDED' || n.flag === 'OVER_RECORDED';
                const label = `Pump ${n.pumpNumber} nozzle ${n.nozzleNumber}`;
                return (
                  <tr key={n.readingId} className="border-t">
                    <td className="px-4 py-2">
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-gray-600">{n.gradeName}{n.voidedLitres > 0 ? `, ${litres(n.voidedLitres)} voided` : ''}</p>
                      {n.previousClosingLitres !== null && (
                        <p className="text-xs text-amber-800">Opened at a different reading than it closed at ({litres(n.previousClosingLitres)}){n.openingNote ? `: ${n.openingNote}` : ''}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(n.openingLitres)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(closed ? n.closingLitres : n.expectedClosingLitres)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(n.soldLitres)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(n.testLitres)}</td>
                    {closed && (
                      <td className={`px-3 py-2 text-right tabular-nums ${bad ? 'text-red-700 font-semibold' : ''}`}>
                        {litres(n.unrecordedLitres)}
                        {bad && n.unrecordedValueCents ? <span className="block text-xs font-normal">{formatKES(Math.abs(n.unrecordedValueCents))} {n.flag === 'UNRECORDED' ? 'not rung up' : 'over'}</span> : null}
                      </td>
                    )}
                    {onTest && <td className="px-3 py-2 text-right"><button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => onTest(n.nozzleId, label)}>Record test</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-gray-900">Attendants</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Attendant</th>
                <th className="text-right px-3 py-2">Litres</th>
                <th className="text-right px-3 py-2">Sales</th>
                <th className="text-right px-3 py-2">Cash expected</th>
                {closed && <th className="text-right px-3 py-2">Cash handed in</th>}
                {closed && <th className="text-right px-3 py-2">Difference</th>}
              </tr>
            </thead>
            <tbody>
              {summary.byAttendant.map((a) => {
                const short = (a.cashVarianceCents ?? 0) < 0;
                return (
                  <tr key={a.attendantId} className="border-t">
                    <td className="px-4 py-2">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-gray-600">{Object.entries(a.byMethod).filter(([, v]) => v > 0).map(([m, v]) => `${PAYMENT_LABEL[m] ?? m} ${formatKES(v)}`).join(', ') || 'No sales yet'}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(a.litres)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKES(a.revenueCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKES(a.expectedCashCents)}</td>
                    {closed && <td className="px-3 py-2 text-right tabular-nums">{a.declaredCashCents === null ? '-' : formatKES(a.declaredCashCents)}</td>}
                    {closed && (
                      <td className={`px-3 py-2 text-right tabular-nums ${short ? 'text-red-700 font-semibold' : ''}`}>
                        {a.cashVarianceCents === null ? '-' : a.cashVarianceCents === 0 ? <Badge tone="success">Balanced</Badge> : `${a.cashVarianceCents > 0 ? '+' : '-'}${formatKES(Math.abs(a.cashVarianceCents))}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {summary.byPayment.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.byPayment.map((p) => <Badge key={p.method}>{PAYMENT_LABEL[p.method] ?? p.method}: {formatKES(p.totalCents)} ({p.count})</Badge>)}
        </div>
      )}
    </div>
  );
}
