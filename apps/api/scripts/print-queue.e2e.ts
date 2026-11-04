/**
 * End-to-end check of the print queue against a REAL Postgres and a fake TCP printer.
 *
 * It exercises what the mocked unit tests cannot: the conditional UPDATE that stops two bridges taking the
 * same job, retry/expiry timing, stale-claim rescue and tenant scoping against real rows.
 *
 * Run it against a THROWAWAY database only. It deletes every row in PrintJob, Sale, Printer, Store and Business.
 *
 *   docker run -d --rm --name print-e2e-pg -e POSTGRES_PASSWORD=<pick-one> -e POSTGRES_DB=e2e -p 127.0.0.1:55432:5432 postgres:16
 *   export E2E_URL="postgresql://postgres:<pick-one>@127.0.0.1:55432/e2e"
 *   DATABASE_URL="$E2E_URL" DIRECT_URL="$E2E_URL" npx prisma db push --schema ../../prisma/schema.prisma --skip-generate
 *   DATABASE_URL="$E2E_URL" DIRECT_URL="$E2E_URL" LAN_IP=<this machine's 192.168.x.x or 10.x.x.x address>  *     npx ts-node --transpile-only -P tsconfig.json scripts/print-queue.e2e.ts
 *
 * The fake printer must listen on a private address because the API refuses loopback printers.
 */
/* End-to-end check of the print queue against a real Postgres and a fake TCP printer on the LAN address. */
import { createServer, createConnection, type Server } from 'net';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrintersService } from '../src/printers/printers.service';
import { PrintJobsService } from '../src/print-jobs/print-jobs.service';
import { PrintStationsService } from '../src/print-jobs/print-stations.service';

const LAN_IP = process.env.LAN_IP as string;
const PORT = 19100;
let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)}`);
  if (!cond) failures++;
};

function fakePrinter(port: number): Promise<{ server: Server; received: Buffer[] }> {
  const received: Buffer[] = [];
  return new Promise((resolve) => {
    const server = createServer((sock) => {
      const chunks: Buffer[] = [];
      sock.on('data', (c) => chunks.push(c));
      sock.on('end', () => received.push(Buffer.concat(chunks)));
    });
    server.listen(port, LAN_IP, () => resolve({ server, received }));
  });
}

/** What the desktop bridge's Rust command does: open a TCP connection and write the bytes. */
function bridgeWrite(host: string, port: number, base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host, port }, () => s.end(Buffer.from(base64, 'base64'), () => resolve()));
    s.on('error', reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const printers = new PrintersService(prisma);

  await prisma.printStation.deleteMany({}); await prisma.printJob.deleteMany({}); await prisma.sale.deleteMany({}); await prisma.printer.deleteMany({}); await prisma.store.deleteMany({}); await prisma.business.deleteMany({});
  await prisma.business.create({ data: { id: 'bizA', name: 'Biz A' } as any });
  await prisma.business.create({ data: { id: 'bizB', name: 'Biz B' } as any });
  await prisma.store.create({ data: { id: 'storeA', businessId: 'bizA', name: 'Main', storeCode: 'A01' } as any });
  const printer = await prisma.printer.create({ data: { id: 'printerA', storeId: 'storeA', name: 'Kitchen', connectionType: 'NETWORK', connectionDetails: `${LAN_IP}:${PORT}`, handles: '["KOT_FOOD"]' } });
  try { await prisma.sale.create({ data: { id: 'sale-1', offlineId: 'off-1', businessId: 'bizA', storeId: 'storeA' } as any }); } catch (e: any) { console.log('SALE SEED:', String(e.message).split('\n').filter((l: string) => /Argument/.test(l)).join(' | ')); process.exit(3); }
  const hostname = await prisma.printer.create({ data: { id: 'printerH', storeId: 'storeA', name: 'ByName', connectionType: 'NETWORK', connectionDetails: `localhost:${PORT}`, handles: '[]' } });
  void hostname;

  const actorA = { id: 'userA', businessId: 'bizA', role: 'OWNER' };
  const cashierA = { id: 'userC', businessId: 'bizA', role: 'CASHIER' };
  const actorB = { id: 'userB', businessId: 'bizB', role: 'OWNER' };
  const bytes = (s: string) => Buffer.from(s).toString('base64');

  // 1. direct mode, printer reachable
  delete process.env.PRINT_DELIVERY_MODE;
  const direct = new PrintJobsService(prisma, printers);
  const fp = await fakePrinter(PORT);
  const r1 = await direct.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'KOT', data: bytes('KOT-1'), refNumber: '42' }, actorA);
  await sleep(150);
  check('direct: reachable printer gets the bytes', r1.delivered && fp.received.length === 1 && fp.received[0].toString() === 'KOT-1', { delivered: r1.delivered, got: fp.received.map(String) });
  const row1 = await prisma.printJob.findUniqueOrThrow({ where: { id: r1.job.id } });
  check('direct: job SENT, bytes dropped from the table', row1.status === 'SENT' && row1.method === 'DIRECT' && row1.payload === null, row1);

  // 2. direct mode, printer down -> stays queued with the reason
  fp.server.close();
  await sleep(50);
  const r2 = await direct.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'KOT', data: bytes('KOT-2') }, actorA);
  const row2 = await prisma.printJob.findUniqueOrThrow({ where: { id: r2.job.id } });
  check('direct: unreachable printer leaves the job QUEUED for a bridge, with the error', !r2.delivered && row2.status === 'QUEUED' && row2.method === 'BRIDGE' && !!row2.lastError && row2.payload !== null, row2);

  // 3. queue mode: two bridges race for one job
  process.env.PRINT_DELIVERY_MODE = 'queue';
  const queued = new PrintJobsService(prisma, printers);
  const fp2 = await fakePrinter(PORT);
  await prisma.printJob.deleteMany({});
  const r3 = await queued.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'RECEIPT', data: bytes('RECEIPT-3'), saleId: 'sale-1', refNumber: 'R-1' }, cashierA);
  check('queue mode: nothing sent by the server', !r3.delivered && fp2.received.length === 0);
  const [c1, c2] = await Promise.all([
    queued.claim('storeA', 'bridge-1', 5, cashierA),
    queued.claim('storeA', 'bridge-2', 5, cashierA),
  ]);
  check('race: exactly one bridge wins the job', c1.length + c2.length === 1, { c1: c1.length, c2: c2.length });
  const winner = c1[0] ?? c2[0];
  const winnerId = c1.length ? 'bridge-1' : 'bridge-2';
  check('claim returns the private IP, port and bytes', winner.host === LAN_IP && winner.port === PORT && Buffer.from(winner.data, 'base64').toString() === 'RECEIPT-3', winner);
  const loser = winnerId === 'bridge-1' ? 'bridge-2' : 'bridge-1';
  await queued.complete(winner.id, { ok: true }, loser, cashierA);
  check('a bridge that does not own the job cannot complete it', (await prisma.printJob.findUniqueOrThrow({ where: { id: winner.id } })).status === 'SENDING');
  await bridgeWrite(winner.host, winner.port, winner.data);
  await queued.complete(winner.id, { ok: true }, winnerId, cashierA);
  await sleep(150);
  const row3 = await prisma.printJob.findUniqueOrThrow({ where: { id: winner.id } });
  check('bridge delivery: printer received the exact bytes and the job is SENT', fp2.received.length === 1 && fp2.received[0].toString() === 'RECEIPT-3' && row3.status === 'SENT' && row3.payload === null, { got: fp2.received.map(String), row3 });
  check('a finished job is not claimable again', (await queued.claim('storeA', 'bridge-1', 5, cashierA)).length === 0);

  // 4. receipt copy numbering counts the print
  check('receipt copy: the bridge print of that sale is counted (next is copy 1)', JSON.stringify(await queued.nextReceiptCopy('sale-1', cashierA)) === '{"copyNumber":1}');

  // 5. failures: retried with delay, then FAILED after 5 attempts
  const r5 = await queued.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'RECEIPT', data: bytes('RECEIPT-5') }, cashierA);
  let last: string = '';
  for (let i = 1; i <= 5; i++) {
    await prisma.printJob.update({ where: { id: r5.job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const [job] = await queued.claim('storeA', 'bridge-1', 5, cashierA);
    if (!job) { last = 'not claimable at attempt ' + i; break; }
    const res = await queued.complete(job.id, { ok: false, error: 'ECONNREFUSED' }, 'bridge-1', cashierA);
    last = res.status;
  }
  const row5 = await prisma.printJob.findUniqueOrThrow({ where: { id: r5.job.id } });
  check('5 failed attempts end in FAILED with the last error', last === 'FAILED' && row5.status === 'FAILED' && row5.attempts === 5 && row5.lastError === 'ECONNREFUSED', { last, row5 });

  // 6. manager retry puts it back and it prints
  await queued.retry(r5.job.id, actorA);
  const [again] = await queued.claim('storeA', 'bridge-1', 5, cashierA);
  check('manager retry makes a FAILED job claimable again', !!again && again.id === r5.job.id);
  await queued.complete(again.id, { ok: true }, 'bridge-1', cashierA);

  // 7. stale SENDING job (bridge died) is recovered
  const r7 = await queued.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'RECEIPT', data: bytes('R7') }, cashierA);
  const [first] = await queued.claim('storeA', 'bridge-dead', 5, cashierA);
  check('first bridge claims it', first?.id === r7.job.id);
  check('while fresh, another bridge cannot take it', (await queued.claim('storeA', 'bridge-2', 5, cashierA)).length === 0);
  await prisma.printJob.update({ where: { id: r7.job.id }, data: { claimedAt: new Date(Date.now() - 120_000) } });
  const [rescued] = await queued.claim('storeA', 'bridge-2', 5, cashierA);
  check('after the bridge goes silent, another one rescues the job', rescued?.id === r7.job.id);
  await queued.complete(rescued.id, { ok: true }, 'bridge-2', cashierA);

  // 8. expiry: a stale kitchen ticket is never printed late
  const r8 = await queued.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'KOT', data: bytes('OLD-KOT') }, cashierA);
  await prisma.printJob.update({ where: { id: r8.job.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check('expired ticket is not handed to a bridge', (await queued.claim('storeA', 'bridge-1', 5, cashierA)).length === 0);
  check('...and is marked EXPIRED', (await prisma.printJob.findUniqueOrThrow({ where: { id: r8.job.id } })).status === 'EXPIRED');

  // 9. hostname printer cannot be used by a bridge: failed, not sent anywhere
  const r9 = await queued.enqueue({ storeId: 'storeA', printerId: 'printerH', kind: 'RECEIPT', data: bytes('R9') }, cashierA);
  check('bridge never receives a job for a hostname printer', (await queued.claim('storeA', 'bridge-1', 5, cashierA)).length === 0);
  const row9 = await prisma.printJob.findUniqueOrThrow({ where: { id: r9.job.id } });
  check('...it is FAILED with an explanation', row9.status === 'FAILED' && /private IP/.test(row9.lastError ?? ''), row9.lastError);

  // 10. tenant isolation against real data
  const other = await queued.claim('storeA', 'bridge-x', 5, actorB).catch((e) => e.constructor.name);
  check('another business cannot claim from this store', other === 'NotFoundException', other);
  const r10 = await queued.enqueue({ storeId: 'storeA', printerId: printer.id, kind: 'RECEIPT', data: bytes('R10') }, cashierA);
  const peek = await queued.list('storeA', undefined, 50, actorA);
  check('list shows history without any payload column', peek.length > 5 && peek.every((j: any) => !('payload' in j)));
  const cancelled = await queued.cancel(r10.job.id, actorA);
  check('manager can cancel a waiting job', (cancelled as any).status === 'CANCELLED');
  const crossRetry = await queued.retry(r10.job.id, actorB).catch((e) => e.constructor.name);
  check('another business cannot retry this job', crossRetry === 'NotFoundException', crossRetry);

  // 11. client-side print log + copy numbering
  await queued.log({ storeId: 'storeA', kind: 'RECEIPT', method: 'BROWSER', ok: true, saleId: 'sale-1', refNumber: 'R-1' }, cashierA);
  const copies = await queued.nextReceiptCopy('sale-1', { ...cashierA }).catch((e) => e.constructor.name);
  check('copy number counts the bridge print AND the browser print', JSON.stringify(copies) === '{"copyNumber":2}', copies);

  // 12. print stations: token auth, online flag, revoke
  const stationsSvc = new PrintStationsService(prisma);
  const created = await stationsSvc.create({ storeId: 'storeA', name: 'Front till' }, actorA);
  const rowToken = await prisma.printStation.findUniqueOrThrow({ where: { id: created.station.id } });
  check('station token is stored hashed, never in clear', rowToken.tokenHash !== created.token && !JSON.stringify(rowToken).includes(created.token));
  const auth1 = await stationsSvc.authenticate(created.token);
  check('station authenticates and is scoped to its store', auth1?.storeId === 'storeA' && auth1?.businessId === 'bizA', auth1);
  check('a wrong token does not authenticate', (await stationsSvc.authenticate('pst_' + 'A'.repeat(43))) === null);
  const listed = await stationsSvc.list('storeA', actorA);
  check('station shows online after it was seen', listed.length === 1 && (listed[0] as any).online === true, listed);
  check('another business sees none of this store\'s stations', (await stationsSvc.list('storeA', actorB)).length === 0);
  await stationsSvc.revoke(created.station.id, actorA);
  check('a revoked station can no longer authenticate', (await stationsSvc.authenticate(created.token)) === null);

  // 13. audit summary over real rows
  await queued.log({ storeId: 'storeA', kind: 'RECEIPT', method: 'USB', ok: true, saleId: 'sale-1', copyNumber: 1 }, cashierA);
  await queued.log({ storeId: 'storeA', kind: 'RECEIPT', method: 'USB', ok: true, saleId: 'sale-1', copyNumber: 2 }, cashierA);
  await queued.log({ storeId: 'storeA', kind: 'DRAWER', method: 'USB', ok: true, reason: 'MANUAL' }, cashierA);
  await queued.log({ storeId: 'storeA', kind: 'DRAWER', method: 'USB', ok: true, reason: 'SALE' }, cashierA);
  const sum = await queued.summary('storeA', 7, actorA);
  check('summary counts the two reprints by that person', sum.reprintsByPerson.length === 1 && sum.reprintsByPerson[0].count === 2, sum.reprintsByPerson);
  check('summary counts only the MANUAL drawer open', sum.manualDrawerOpensByPerson.length === 1 && sum.manualDrawerOpensByPerson[0].count === 1, sum.manualDrawerOpensByPerson);
  check('summary has totals and failure counts', sum.total > 10 && sum.sent > 0 && sum.failed >= 2, { total: sum.total, sent: sum.sent, failed: sum.failed });

  fp2.server.close();
  await prisma.$disconnect();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
