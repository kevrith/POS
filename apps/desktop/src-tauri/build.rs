fn main() {
    // The installer carries the offline server as ONE file, resources/server.tar.gz, made by
    // apps/desktop/scripts/build-server-bundle.mjs. A developer build has none: leave an empty placeholder so Tauri does not
    // refuse to build; the app then explains at run time that this build has no offline server.
    let archive = std::path::Path::new("resources").join("server.tar.gz");
    if !archive.exists() {
        let _ = std::fs::create_dir_all("resources");
        let _ = std::fs::write(&archive, b"");
    }
    println!("cargo:rerun-if-changed=resources/server.tar.gz");
    tauri_build::build()
}
