use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

/// Connect to a network printer and test connectivity
#[tauri::command]
pub async fn connect_printer(host: String, port: u16) -> Result<bool, String> {
    let addr = format!("{}:{}", host, port)
        .parse::<std::net::SocketAddr>()
        .map_err(|e| e.to_string())?;
    match TcpStream::connect_timeout(
        &addr,
        Duration::from_secs(3),
    ) {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Cannot connect to printer at {}:{} — {}", host, port, e)),
    }
}

/// Send ESC/POS data (base64 encoded) to a network printer
#[tauri::command]
pub async fn print_to_network(host: String, port: u16, data_base64: String) -> Result<bool, String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let addr = format!("{}:{}", host, port)
        .parse::<std::net::SocketAddr>()
        .map_err(|e| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(
        &addr,
        Duration::from_secs(5),
    )
    .map_err(|e| format!("Cannot connect to printer: {}", e))?;

    stream.set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;

    stream.write_all(&data)
        .map_err(|e| format!("Print failed: {}", e))?;

    stream.flush()
        .map_err(|e| format!("Flush failed: {}", e))?;

    Ok(true)
}

/// Printers installed on this computer (Windows spooler or CUPS), default first.
#[tauri::command]
pub async fn list_system_printers() -> Result<Vec<crate::system_printer::SystemPrinter>, String> {
    tauri::async_runtime::spawn_blocking(crate::system_printer::list)
        .await
        .map_err(|e| e.to_string())?
}

/// Send ESC/POS data (base64 encoded) to an installed printer by name, with no print dialog.
#[tauri::command]
pub async fn print_to_system_printer(printer_name: String, data_base64: String) -> Result<bool, String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    tauri::async_runtime::spawn_blocking(move || crate::system_printer::print_raw(&printer_name, &data))
        .await
        .map_err(|e| e.to_string())??;
    Ok(true)
}
