#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod printer;
mod system_printer;
mod lan_sync;
mod vscu;
mod cash_drawer;
mod backup;
mod setup;
mod oauth;
mod license;
mod discovery;
mod local_server_core;
mod local_server;

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

/// Set once the window is closing, so the second "exit" request (the one we make ourselves) goes through.
static SHUTTING_DOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn main() {
    use tauri::Manager;

    let app = tauri::Builder::default()
        .manage(local_server::LocalServerState::default())
        .setup(|app| {
            let version = app.package_info().version.to_string();
            println!("KASTRA POS Desktop v{} starting...", version);

            // A computer that keeps its own data starts its database and API now; the web UI shows progress.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let (slot, prep) = {
                    let state = handle.state::<local_server::LocalServerState>();
                    (state.0.clone(), state.1.clone())
                };
                if let Err(e) = local_server::start(&handle, &slot, &prep) {
                    eprintln!("Local server did not start: {}", e);
                }
            });

            // Answer "who is the KASTRA server?" broadcasts only when other computers are allowed to connect.
            tauri::async_runtime::spawn(async {
                if let Ok(cfg) = setup::get_setup_mode().await {
                    if setup::is_local_server_mode(&cfg.mode) && cfg.lan_enabled.unwrap_or(false) {
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
            printer::list_system_printers,
            printer::print_to_system_printer,
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
            oauth::oauth_browser_login,
            setup::test_server_connection,
            setup::get_cloud_url,
            // License
            license::get_machine_id,
            license::validate_license_key,
            // Auto-update
            check_for_app_update,
            // LAN discovery
            discovery::discover_servers,
            // Local server (this computer's own database + API)
            local_server::local_server_defaults,
            local_server::local_server_validate_folders,
            local_server::local_server_start,
            local_server::local_server_restart,
            local_server::local_server_stop,
            local_server::local_server_set_lan,
            local_server::local_server_status,
            local_server::local_server_backup,
            local_server::local_server_backups,
            local_server::local_server_restore,
        ])
        .build(tauri::generate_context!())
        .expect("error while building KASTRA POS desktop");

    app.run(|app_handle, event| {
        // Closing the window must not cut the database off mid-write: stop it cleanly (with a backup if the last one is
        // over an hour old) and only then let the app exit.
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            if !SHUTTING_DOWN.swap(true, std::sync::atomic::Ordering::SeqCst) {
                api.prevent_exit();
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    local_server::shutdown(&handle);
                    handle.exit(0);
                });
            }
        }
    });
}
