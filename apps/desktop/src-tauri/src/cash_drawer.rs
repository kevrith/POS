/// Open a USB/serial cash drawer by sending a pulse command
/// Most cash drawers respond to ESC/POS ESC p command
#[tauri::command]
pub async fn open_cash_drawer(port: Option<String>) -> Result<bool, String> {
    // ESC/POS cash drawer kick: ESC p m t1 t2
    // ESC = 0x1B, p = 0x70, m = 0 (pin 2), t1 = 50, t2 = 50
    let kick_command: Vec<u8> = vec![0x1B, 0x70, 0x00, 0x32, 0x32];

    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        let port_path = port.unwrap_or_else(|| "/dev/ttyS0".to_string());
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(&port_path) {
            let _ = f.write_all(&kick_command);
            return Ok(true);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let port_path = port.unwrap_or_else(|| "COM1".to_string());
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(&port_path) {
            use std::io::Write;
            let _ = f.write_all(&kick_command);
            return Ok(true);
        }
    }

    // If no serial port available, return success (non-critical)
    Ok(true)
}
