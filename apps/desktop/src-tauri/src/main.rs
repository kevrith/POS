#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod printer;
mod lan_sync;
mod vscu;
mod cash_drawer;
mod backup;
mod setup;
mod license;
mod discovery;

use tauri::Manager;

/// Check the remote server for a newer application version.
///
/// Calls `GET <VITE_API_URL>/api/v1/super-admin/update-check` and returns the
/// JSON response body.  The web layer can compare the returned `latestVersion`
/// field against `app.getVersion()` to decide whether to prompt the user.
///
/// Falls back to `http://localhost:3010` when `VITE_API_URL` is not set.
#[tauri::command]
async fn check_for_app_update() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = std::env::var("VITE_API_URL")
        .unwrap_or_else(|_| "http://localhost:3010".to_string());
    let url = format!("{}/api/v1/super-admin/update-check", base_url.trim_end_matches('/'));

    match client.get(&url).send().await {
        Ok(resp) => {
            let json = resp
                .json::<serde_json::Value>()
                .await
                .map_err(|e| e.to_string())?;
            Ok(json)
        }
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let version = app.package_info().version.to_string();
            println!("KASTRA POS Desktop v{} starting...", version);

            // Start LAN discovery responder if this machine is a server/standalone
            let rt = tokio::runtime::Handle::current();
            rt.spawn(async {
                if let Ok(cfg) = setup::get_setup_mode().await {
                    if cfg.mode == "SERVER" || cfg.mode == "STANDALONE" {
                        discovery::start_discovery_responder(3010);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Printer
            printer::connect_printer,
            printer::print_to_network,
            // LAN sync
            lan_sync::get_lan_ip,
            lan_sync::get_local_ip,
            lan_sync::start_lan_sync_server,
            lan_sync::broadcast_event,
            lan_sync::send_sync_message,
            // eTIMS / VSCU queue
            vscu::vscu_get_pending_count,
            vscu::vscu_queue_submit,
            vscu::vscu_process_queue,
            // Peripherals
            cash_drawer::open_cash_drawer,
            // Database
            backup::backup_database,
            backup::restore_database,
            backup::list_backups,
            // Setup / mode
            setup::get_setup_mode,
            setup::set_setup_mode,
            setup::reset_setup,
            setup::test_server_connection,
            setup::get_cloud_url,
            // License
            license::get_machine_id,
            license::validate_license_key,
            // Auto-update
            check_for_app_update,
            // LAN discovery
            discovery::discover_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KASTRA POS desktop");
}
