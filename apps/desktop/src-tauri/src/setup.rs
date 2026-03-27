use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct SetupConfig {
    /// Network topology: STANDALONE | SERVER | CLIENT
    pub mode: String,
    /// Device role: FULL_POS | CASHIER | KIOSK | KDS | MANAGER
    /// Meaningful on CLIENT; defaults to FULL_POS for STANDALONE/SERVER
    pub device_role: Option<String>,
    /// Only set when mode == CLIENT
    pub server_url: Option<String>,
    pub store_id: Option<String>,
    /// Activated license key (on-premise deployments)
    pub license_key: Option<String>,
    /// Display name for this terminal (shown in admin panel)
    pub terminal_name: Option<String>,
}

fn get_config_path() -> PathBuf {
    let mut path = dirs_next::config_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    path.push("kastra-pos");
    fs::create_dir_all(&path).ok();
    path.push("mode.json");
    path
}

#[tauri::command]
pub async fn get_setup_mode() -> Result<SetupConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        // Return a sentinel value so the UI knows first-run wizard must be shown
        return Ok(SetupConfig {
            mode: "UNCONFIGURED".to_string(),
            device_role: None,
            server_url: None,
            store_id: None,
            license_key: None,
            terminal_name: None,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setup_mode(
    mode: String,
    device_role: Option<String>,
    server_url: Option<String>,
    store_id: Option<String>,
    license_key: Option<String>,
    terminal_name: Option<String>,
) -> Result<bool, String> {
    let config = SetupConfig {
        mode,
        device_role,
        server_url,
        store_id,
        license_key,
        terminal_name,
    };
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let path = get_config_path();
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Reset setup config — shows the wizard again on next launch
#[tauri::command]
pub async fn reset_setup() -> Result<bool, String> {
    let path = get_config_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

/// Return the vendor's cloud server URL baked in at build time.
/// Set VITE_KASTRA_CLOUD_URL in the web .env before building the installer.
#[tauri::command]
pub fn get_cloud_url() -> String {
    // The env var is embedded at compile-time via the build script or
    // via the web Vite build that Tauri bundles.
    // We expose it as a Tauri command so the setup wizard can read it.
    option_env!("KASTRA_CLOUD_URL")
        .unwrap_or("https://api.kastra.co.ke")
        .to_string()
}

#[tauri::command]
pub async fn test_server_connection(server_url: String) -> Result<bool, String> {
    use tokio::net::TcpStream;

    let url = server_url.trim_end_matches('/');

    // Derive host:port from the URL
    let host_port = if url.starts_with("http://") {
        let h = url.trim_start_matches("http://");
        if h.contains(':') {
            h.to_string()
        } else {
            format!("{}:3010", h)
        }
    } else if url.starts_with("https://") {
        let h = url.trim_start_matches("https://");
        if h.contains(':') {
            h.to_string()
        } else {
            format!("{}:443", h)
        }
    } else {
        // Bare host — assume default API port
        if url.contains(':') {
            url.to_string()
        } else {
            format!("{}:3010", url)
        }
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        TcpStream::connect(&host_port),
    )
    .await
    {
        Ok(Ok(_)) => Ok(true),
        _ => Ok(false),
    }
}
