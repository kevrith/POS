use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize)]
pub struct MachineInfo {
    pub machine_id: String,
    pub hostname: String,
}

/// Derive a stable machine ID.
///
/// Priority:
///   1. Linux  — contents of `/etc/machine-id` (trimmed)
///   2. macOS  — stdout of `ioreg -rd1 -c IOPlatformExpertDevice` parsed for
///               `IOPlatformUUID` value
///   3. Fallback — SHA-256 of the hostname (hex-encoded)
pub fn compute_machine_id(hostname: &str) -> String {
    // --- Linux: /etc/machine-id ---
    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
            let trimmed = id.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
    }

    // --- Windows: MachineGuid from registry ---
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    if let Some(guid) = line.split_whitespace().last() {
                        let trimmed = guid.trim().to_string();
                        if !trimmed.is_empty() {
                            return trimmed;
                        }
                    }
                }
            }
        }
    }

    // --- macOS: IOPlatformUUID via ioreg ---
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IOPlatformUUID") {
                    // Line looks like:   "IOPlatformUUID" = "XXXXXXXX-XXXX-..."
                    if let Some(start) = line.rfind('"') {
                        let after = &line[..start];
                        if let Some(end) = after.rfind('"') {
                            let uuid = &after[end + 1..];
                            if !uuid.is_empty() {
                                return uuid.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    // --- Fallback: SHA-256 of hostname ---
    let mut hasher = Sha256::new();
    hasher.update(hostname.as_bytes());
    hex::encode(hasher.finalize())
}

fn host_name() -> String {
    hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or_else(|_| "unknown".to_string())
}

/// This computer's id, as a licence is bound to it.
pub fn machine_id() -> String {
    compute_machine_id(&host_name())
}

#[tauri::command]
pub async fn get_machine_id() -> Result<MachineInfo, String> {
    let hostname = host_name();
    Ok(MachineInfo { machine_id: compute_machine_id(&hostname), hostname })
}
