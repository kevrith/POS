use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct BackupInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: u64,
}

fn get_db_source() -> PathBuf {
    // The NestJS API's SQLite DB lives at prisma/dev.db relative to the repo root.
    // At runtime the desktop app's cwd is typically the repo root when launched via
    // `npm run dev`, or the installed-app directory in production.
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push("prisma");
    path.push("dev.db");
    path
}

#[tauri::command]
pub async fn backup_database(dest_path: String) -> Result<bool, String> {
    let source = get_db_source();
    if !source.exists() {
        return Err(format!("Database not found at: {}", source.display()));
    }

    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::copy(&source, &dest).map_err(|e| format!("Backup failed: {}", e))?;
    Ok(true)
}

#[tauri::command]
pub async fn restore_database(src_path: String) -> Result<bool, String> {
    let source = PathBuf::from(&src_path);
    if !source.exists() {
        return Err(format!("Backup file not found: {}", src_path));
    }

    let dest = get_db_source();
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Preserve the current DB as a .bak before overwriting
    let bak = dest.with_extension("db.bak");
    if dest.exists() {
        fs::copy(&dest, &bak).ok();
    }

    fs::copy(&source, &dest).map_err(|e| format!("Restore failed: {}", e))?;
    Ok(true)
}

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
        if path.extension().and_then(|e| e.to_str()) == Some("db") {
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

    // Most-recent first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}
