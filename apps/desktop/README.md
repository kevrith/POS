# KASTRA POS — Desktop (Tauri v2)

Native desktop shell around the KASTRA POS web app, adding the hardware and
offline capabilities a browser cannot reach: direct printer sockets, cash-drawer
kick, LAN peer sync, an offline eTIMS/VSCU queue in SQLite, and machine-bound
licensing.

- Product name: **KASTRA POS** · identifier `co.ke.kastra.pos`
- Frontend: `apps/web` — dev from the Vite server, release from `apps/web/dist`

---

## Prerequisites

- Rust toolchain — https://rustup.rs
- Node.js 20+
- Tauri v2 system dependencies for your OS (WebKitGTK on Linux, WebView2 on Windows)

---

## Development

```bash
npm run dev          # tauri dev — also starts the web dev server for you
```

`beforeDevCommand` runs `npm run dev:web` from the repo root, so you don't need a
second terminal.

`devUrl` in `src-tauri/tauri.conf.json` is `http://localhost:3005`, the port `apps/web` serves on.

## Building

```bash
cd ../web && npm run build     # REQUIRED FIRST — Tauri bundles apps/web/dist
cd ../desktop && npm run build
```

Installers land in `src-tauri/target/release/bundle/`.

`beforeBuildCommand` builds the web app, but if you build the web app separately
make sure it finished — a stale `apps/web/dist` ships silently.

Releases are automated by `.github/workflows/desktop-release.yml`.

---

## Native modules (`src-tauri/src/`)

| Module | Capability |
|---|---|
| `printer.rs` | Network ESC/POS printers over a raw TCP socket, with connect timeout. `print_to_network` is what the web **print bridge** (`apps/web/src/lib/printBridge.ts`) calls to deliver queued jobs; it only connects to a private IPv4 literal (`private_printer_addr`: 10.x, 172.16-31.x, 192.168.x), so a hostile or wrong job cannot make this computer connect to loopback, a public host or a metadata address. `private_printer_addr` is unit-tested by compiling it in a scratch crate; the full crate still cannot be built on every machine |
| `system_printer.rs` | Printers installed on this computer: lists them and sends raw ESC/POS to one by name with no print dialog (Windows spooler RAW datatype; CUPS `lpstat` / `lp -o raw` on Linux and macOS). Commands `list_system_printers` and `print_to_system_printer` live in `printer.rs`; the web side is `apps/web/src/lib/desktopPrinter.ts`. The platform code has no Tauri dependency, so its unit tests run from a scratch crate that includes the file |
| `cash_drawer.rs` | Drawer kick — ESC/POS `ESC p` pulse over USB/serial |
| `discovery.rs` | LAN server auto-discovery. UDP :47474 — client broadcasts `KASTRA_DISCOVER`, servers reply `KASTRA_SERVER:{api_port}:{hostname}`; client collects responses for 2 s |
| `lan_sync.rs` | TCP peer sync — a server terminal holds a registry of connected client streams and pushes events to all of them |
| `vscu.rs` | Offline eTIMS/VSCU queue in local SQLite (`rusqlite`) — sales are signed and held until KRA is reachable |
| `license.rs` | Machine-bound licensing — stable machine id derived and SHA-256 hashed |
| `setup.rs` | First-run topology: mode `STANDALONE` / `SERVER` / `CLIENT`, device role `FULL_POS` / `CASHIER` / `KIOSK` / `KDS` / `MANAGER` |
| `backup.rs` | Local database backup/restore to disk |

Auto-updates use the built-in Tauri updater against signed GitHub Releases.

---

## Network topologies

- **STANDALONE** — one terminal, its own local queue.
- **SERVER** — hosts the API for the site; answers discovery broadcasts and fans out
  sync events to connected clients.
- **CLIENT** — discovers the server on the LAN and syncs to it; `device_role`
  decides which UI it boots into (full POS, cashier-only, kiosk, kitchen display, or
  manager).

## First-run setup and reinstalls

The setup wizard (`web/src/pages/DesktopSetupPage.tsx`) shows whenever
`get_setup_mode` reports `UNCONFIGURED`. The choice is saved in `mode.json` under
the OS config dir (`%APPDATA%\kastra-pos\` on Windows), including the optional
`business_name` that pre-fills the registration form.

On Windows, `src-tauri/wix/setup-cleanup.wxs` deletes `mode.json` when the MSI is
uninstalled (not on upgrades), so a fresh install opens the wizard. This fragment
is untested on a real Windows build: confirm it after the next release by
reinstalling and checking the wizard appears. To reset by hand, delete the file or
use Reconfigure on the login page.

## Google sign-in

The popup flow used on the web cannot work in the desktop webview, so
`oauth_browser_login` (`src-tauri/src/oauth.rs`) opens Google in the system browser and
catches the redirect on a one-shot `127.0.0.1` port. `web/src/lib/googleDesktop.ts`
drives it with PKCE; the API's `POST /auth/google/desktop-exchange` swaps the code for a
Google token (it holds the client secret), and the normal `google/token` or
`google/register` endpoint finishes the login. The API needs
`GOOGLE_DESKTOP_CLIENT_ID` and `GOOGLE_DESKTOP_CLIENT_SECRET` from a Google OAuth client
of type "Desktop app"; the desktop build itself needs no Google variable.

---

When you add a Tauri command, change the discovery/sync protocol, or alter the
setup topology, update this README in the same change.
