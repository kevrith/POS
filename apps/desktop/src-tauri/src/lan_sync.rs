use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;

/// Shared registry of currently-connected sync client streams.
/// Each entry is a clone of the TcpStream write-end used to push messages.
type ClientList = Arc<Mutex<Vec<TcpStream>>>;

// Module-level singleton so broadcast_event can reach connected clients.
static CLIENTS: std::sync::OnceLock<ClientList> = std::sync::OnceLock::new();

fn clients() -> &'static ClientList {
    CLIENTS.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Determine the LAN-facing IP address without sending any data.
/// We open a UDP socket and "connect" it to a public address so the OS picks
/// the correct outbound interface — no packets are ever transmitted.
fn detect_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Handle a single connected sync client on its own thread.
///
/// We clone the stream twice:
///   - `read_stream`  — consumed by `BufReader` for line-by-line reading.
///   - `write_stream` — kept for writing ACKs back and for broadcast registration.
///
/// On disconnect, dead connections are pruned from the global client list.
fn handle_sync_client(stream: TcpStream, clients: ClientList) {
    let peer = stream
        .peer_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    println!("[LAN sync] client connected: {}", peer);

    // Two independent clones — one for reading, one for writing.
    let read_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[LAN sync] failed to clone read stream for {}: {}", peer, e);
            return;
        }
    };
    let mut write_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[LAN sync] failed to clone write stream for {}: {}", peer, e);
            return;
        }
    };

    // Register the write-end so broadcast_event can reach this client.
    {
        let reg_stream = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[LAN sync] failed to clone registration stream for {}", peer);
                return;
            }
        };
        let mut list = clients.lock().unwrap();
        list.push(reg_stream);
    }

    // Read newline-delimited messages; echo each one back as ACK.
    let reader = BufReader::new(read_stream);
    for line in reader.lines() {
        match line {
            Ok(msg) => {
                let ack = format!("ACK:{}\n", msg);
                // Best-effort — ignore write errors (client may have closed).
                let _ = write_stream.write_all(ack.as_bytes());
            }
            Err(_) => break, // EOF or broken pipe — client disconnected.
        }
    }

    println!("[LAN sync] client disconnected: {}", peer);

    // Clean up: remove all dead streams from the registry.
    // We detect dead streams by attempting a zero-byte write.
    let mut list = clients.lock().unwrap();
    list.retain_mut(|s| s.write_all(b"").is_ok());
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Return the LAN-facing IP address of this machine.
/// Kept for backwards-compatibility with existing invoke_handler registrations.
#[tauri::command]
pub async fn get_lan_ip() -> Result<String, String> {
    Ok(detect_local_ip())
}

/// Convenience alias exposed under a second Tauri command name.
#[tauri::command]
pub async fn get_local_ip() -> String {
    detect_local_ip()
}

/// Start a real TCP sync server that accepts newline-delimited messages from
/// secondary POS terminals on the LAN.
///
/// The server runs in a background OS thread so it does not block the Tauri
/// async runtime.  Returns a human-readable confirmation string including the
/// bound address clients should connect to.
///
/// If `port` is omitted, port 3011 is used (matching the original stub default).
#[tauri::command]
pub async fn start_lan_sync_server(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(3011);
    let bind_addr = format!("0.0.0.0:{}", port);
    let local_ip = detect_local_ip();

    let listener = TcpListener::bind(&bind_addr)
        .map_err(|e| format!("Failed to bind TCP server on {}: {}", bind_addr, e))?;

    println!("[LAN sync] TCP server listening on {}", bind_addr);

    let clients_ref = Arc::clone(clients());

    thread::spawn(move || {
        for incoming in listener.incoming() {
            match incoming {
                Ok(stream) => {
                    let c = Arc::clone(&clients_ref);
                    thread::spawn(move || handle_sync_client(stream, c));
                }
                Err(e) => {
                    eprintln!("[LAN sync] accept error: {}", e);
                }
            }
        }
    });

    Ok(format!(
        "LAN sync TCP server started — connect to {}:{}",
        local_ip, port
    ))
}

/// Push a message to all currently-connected sync clients.
///
/// The message is formatted as `<event_type>|<payload>\n` before being written
/// to each client socket.  Dead connections are pruned automatically.
#[tauri::command]
pub async fn broadcast_event(event_type: String, payload: String) -> Result<bool, String> {
    let message = format!("{}|{}\n", event_type, payload);
    let bytes = message.as_bytes();

    let mut list = clients().lock().unwrap();
    list.retain_mut(|stream| stream.write_all(bytes).is_ok());

    println!(
        "[LAN sync] broadcast '{}' to {} client(s)",
        event_type,
        list.len()
    );
    Ok(true)
}

/// Open a TCP connection to a remote sync server and send a single
/// newline-terminated message.  Returns `"sent"` on success.
///
/// This is the client-side counterpart to `start_lan_sync_server`.
#[tauri::command]
pub async fn send_sync_message(
    host: String,
    port: u16,
    message: String,
) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);
    let mut stream =
        TcpStream::connect(&addr).map_err(|e| format!("Cannot connect to {}: {}", addr, e))?;

    // Avoid blocking indefinitely if the remote stops responding.
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(5)))
        .ok();

    let payload = format!("{}\n", message);
    stream
        .write_all(payload.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok("sent".to_string())
}
