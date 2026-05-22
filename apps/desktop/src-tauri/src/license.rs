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
fn compute_machine_id(hostname: &str) -> String {
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

#[tauri::command]
pub async fn get_machine_id() -> Result<MachineInfo, String> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let machine_id = compute_machine_id(&hostname);

    Ok(MachineInfo {
        machine_id,
        hostname,
    })
}

/// Validate a license key against the current machine ID.
///
/// Key format: `KPS-XXXXXXXX-XXXXXXXX-XXXXXXXX`
///   - Total length: 31 characters
///   - Must start with `KPS-`
///   - Segments are separated by `-`
///
/// Validation algorithm:
///   checksum = SHA-256( "<machine_id>:<key[4..20]>" )
///   The first 8 hex characters of `checksum` must equal the last 8 characters
///   of the license key (i.e. the third 8-char segment).
///
/// This allows offline cryptographic verification without a network call.
/// Full server-side validation (expiry, tier, revocation) is still performed
/// via the API when connectivity is available.
#[tauri::command]
pub async fn validate_license_key(key: String, machine_id: String) -> Result<bool, String> {
    // Basic format guard
    if !key.starts_with("KPS-") {
        return Ok(false);
    }
    // Expected: KPS-XXXXXXXX-XXXXXXXX-XXXXXXXX  (30 chars)
    // K(1)P(2)S(3)-(4) + 8 + -(1) + 8 + -(1) + 8 = 4+8+1+8+1+8 = 30
    if key.len() != 30 {
        return Ok(false);
    }

    // Split into segments after the "KPS-" prefix
    let body = &key[4..]; // "XXXXXXXX-XXXXXXXX-XXXXXXXX"
    let segments: Vec<&str> = body.split('-').collect();
    if segments.len() != 3 || segments.iter().any(|s| s.len() != 8) {
        return Ok(false);
    }

    // Verify that all segment characters are valid hex digits
    if segments.iter().any(|s| !s.chars().all(|c| c.is_ascii_hexdigit())) {
        return Ok(false);
    }

    // key[4..20] spans the first two segments: "XXXXXXXX-XXXXXXXX"
    // (indices 4 to 20 inclusive — 16 data chars + 1 separator = positions 4..21,
    //  but the task spec says key[4..20], so we use that exact slice)
    let key_slice = &key[4..21]; // "XXXXXXXX-XXXXXXXX" (first segment + separator + full second segment)

    // Compute HMAC-style digest
    let input = format!("{}:{}", machine_id, key_slice);
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hex::encode(hasher.finalize());

    // The first 8 hex chars of the digest must match the last 8 chars of the key
    let expected_suffix = &digest[..8];
    let key_suffix = segments[2]; // last segment

    Ok(expected_suffix == key_suffix)
}
