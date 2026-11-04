use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

/// A network printer is a LAN device. The print bridge writes whatever bytes the server hands it to the
/// address the server names, so the address must be a private IPv4 literal (10.x, 172.16-31.x, 192.168.x).
/// This is the same rule the API applies, repeated here so a wrong or hostile job cannot make this computer
/// open a connection to loopback, a public host or a cloud metadata address.
pub(crate) fn private_printer_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
    let ip: Ipv4Addr = host
        .trim()
        .parse()
        .map_err(|_| "The printer address must be an IPv4 address such as 192.168.1.50".to_string())?;
    if !ip.is_private() {
        return Err("Network printers must be on a private LAN address (10.x, 172.16-31.x or 192.168.x)".to_string());
    }
    if port == 0 {
        return Err("The printer port must be between 1 and 65535".to_string());
    }
    Ok(SocketAddr::new(IpAddr::V4(ip), port))
}

/// Connect to a network printer and test connectivity
#[tauri::command]
pub async fn connect_printer(host: String, port: u16) -> Result<bool, String> {
    let addr = private_printer_addr(&host, port)?;
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
    if data.is_empty() {
        return Err("Nothing to print".to_string());
    }
    if data.len() > crate::system_printer::MAX_JOB_BYTES {
        return Err("Print job is too large".to_string());
    }

    let addr = private_printer_addr(&host, port)?;
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

#[cfg(test)]
mod tests {
    use super::private_printer_addr;

    #[test]
    fn accepts_only_private_lan_addresses() {
        assert!(private_printer_addr("192.168.1.50", 9100).is_ok());
        assert!(private_printer_addr(" 10.0.0.7 ", 9100).is_ok());
        assert!(private_printer_addr("172.16.4.2", 9100).is_ok());
        assert!(private_printer_addr("172.31.255.1", 9100).is_ok());
    }

    #[test]
    fn refuses_loopback_public_metadata_and_hostnames() {
        for host in ["127.0.0.1", "8.8.8.8", "169.254.169.254", "172.32.0.1", "0.0.0.0", "printer.local", "::1", ""] {
            assert!(private_printer_addr(host, 9100).is_err(), "{} should be refused", host);
        }
    }

    #[test]
    fn refuses_port_zero() {
        assert!(private_printer_addr("192.168.1.50", 0).is_err());
    }
}
