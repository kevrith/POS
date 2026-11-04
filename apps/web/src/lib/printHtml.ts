/**
 * Print an HTML document through a hidden iframe. Unlike window.open this is not
 * subject to popup blocking, which matters because receipts, reprints and kitchen
 * tickets are printed after awaiting the network, when the click that started
 * them no longer counts as a user gesture. Throws if the document cannot be set up.
 *
 * Every printable page in the app goes through this one function. Documents from
 * @pos/print-core contain no script, so a short delay is enough for fonts to load.
 *
 * The frame is sandboxed WITHOUT allow-scripts. Printed pages interpolate customer, patient
 * and item names, and a same-origin page that ran such a script could read the session token.
 * With the sandbox, markup in a name is inert text; allow-modals keeps the print dialog working
 * and allow-same-origin lets this code write the document and call print() on it.
 */
export function printHtml(html: string, delayMs = 300): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error('Could not open the print preview');
  }
  const cleanup = () => { setTimeout(() => iframe.remove(), 1000); };
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, delayMs);
  // Some browsers never fire afterprint (dialog dismissed on mobile); do not leak the frame.
  setTimeout(cleanup, 120000);
}
