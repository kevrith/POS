use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct SetupConfig {
    pub mode: String, // SERVER | CLIENT | STANDALONE
    pub server_url: Option<String>,
    pub store_id: Option<String>,
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
        return Ok(SetupConfig {
            mode: "STANDALONE".to_string(),
            server_url: None,
            store_id: None,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setup_mode(
    mode: String,
    server_url: Option<String>,
    store_id: Option<String>,
) -> Result<bool, String> {
    let config = SetupConfig {
        mode,
        server_url,
        store_id,
    };
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let path = get_config_path();
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
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
