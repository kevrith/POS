# KASTRA POS Desktop (Tauri v2)

Enterprise desktop POS application wrapping the KASTRA POS web app with native capabilities.

## Prerequisites
- Rust toolchain: https://rustup.rs
- Tauri CLI: `cargo install tauri-cli`
- Node.js 18+

## Development
```bash
# Start the web app (in a separate terminal)
cd ../web && npm run dev

# Start Tauri desktop
npm run dev
```

## Native Features
- **Network Printer**: TCP socket connection to ESC/POS printers
- **Cash Drawer**: Serial port kick command
- **LAN Sync**: Discover and sync with other POS terminals on local network
- **VSCU**: Offline eTIMS submission queue with local SQLite storage
- **Auto-Updates**: Built-in Tauri updater support

## Building
```bash
npm run build
```
Produces installers in `src-tauri/target/release/bundle/`
