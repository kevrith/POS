use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Deserialize)]
pub struct BackupInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: u64,
}

/// Read DATABASE_URL from env, falling back to the default local connection.
fn get_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://kastra:kastra2026@localhost:5432/kastra_pos".to_string())
}

/// Backup the PostgreSQL database using pg_dump (custom binary format → .dump).
#[tauri::command]
pub async fn backup_database(dest_path: String) -> Result<bool, String> {
    let db_url = get_database_url();
    let dest = PathBuf::from(&dest_path);

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let output = Command::new("pg_dump")
        .arg("--dbname")
        .arg(&db_url)
        .arg("--format=custom")
        .arg("--file")
        .arg(&dest_path)
        .output()
        .map_err(|e| format!("pg_dump not found or failed to start: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("pg_dump failed: {}", stderr))
    }
}

/// Restore the PostgreSQL database from a pg_dump backup file.
#[tauri::command]
pub async fn restore_database(src_path: String) -> Result<bool, String> {
    let db_url = get_database_url();
    let source = PathBuf::from(&src_path);

    if !source.exists() {
        return Err(format!("Backup file not found: {}", src_path));
    }

    let output = Command::new("pg_restore")
        .arg("--dbname")
        .arg(&db_url)
        .arg("--clean")        // drop objects before recreating
        .arg("--if-exists")    // suppress errors on missing objects
        .arg("--no-owner")     // skip ownership commands (avoids permission issues)
        .arg(&src_path)
        .output()
        .map_err(|e| format!("pg_restore not found or failed to start: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // pg_restore exits non-zero for recoverable warnings (e.g. "does not exist, skipping").
        // Only treat it as a real failure if the output contains a hard "error:" line.
        if stderr.to_lowercase().contains("error:") {
            Err(format!("pg_restore failed: {}", stderr))
        } else {
            Ok(true)
        }
    }
}

/// List .dump and .sql backup files in a directory, most-recent first.
#[tauri::command]
pub async fn list_backups(backup_dir: String) -> Result<Vec<BackupInfo>, String> {
    let dir = PathBuf::from(&backup_dir);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<BackupInfo> = vec![];
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext == "dump" || ext == "sql" {
            let metadata = fs::metadata(&path).ok();
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let created = metadata
                .and_then(|m| m.created().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            backups.push(BackupInfo {
                path: path.to_string_lossy().to_string(),
                filename: entry.file_name().to_string_lossy().to_string(),
                size_bytes: size,
                created_at: created,
            });
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}
