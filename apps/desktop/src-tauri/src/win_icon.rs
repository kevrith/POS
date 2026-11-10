//! Crisp window icons on Windows.
//!
//! Tauri builds the running window's icon from ONE image and lets Windows rescale it for the title bar (16 px at 100%
//! display scaling) and the taskbar (24-32 px). That rescale is poor, so the logo looked soft. `icon.ico` already holds a
//! hand-sized frame for every size, and the exe embeds it as resource 32512, so here we ask Windows for the frame that
//! matches each place EXACTLY (at this window's display scaling) and set the small and big window icons ourselves.
//!
//! Called at start-up and again when the window moves to a screen with different scaling. Best effort: on any failure the
//! icon Tauri already set stays.

#[cfg(windows)]
pub fn apply(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_DEFAULTCOLOR, LoadImageW, SM_CXICON, SM_CXSMICON, SendMessageW, WM_SETICON,
    };

    /// The id tauri-build gives the app icon in the exe (IDI_APPLICATION).
    const APP_ICON_RESOURCE: usize = 32512;

    let Ok(handle) = window.hwnd() else { return };
    // `handle.0` is a pointer or an integer depending on the `windows` crate version; either way it casts through isize.
    let hwnd = handle.0 as isize as HWND;
    // SAFETY: plain Win32 calls on this window's own handle; the loaded icons are shared resources Windows owns.
    unsafe {
        let dpi = match GetDpiForWindow(hwnd) {
            0 => 96,
            d => d,
        };
        let module = GetModuleHandleW(std::ptr::null());
        for (which, metric) in [(ICON_SMALL, SM_CXSMICON), (ICON_BIG, SM_CXICON)] {
            let px = GetSystemMetricsForDpi(metric, dpi);
            let icon = LoadImageW(module, APP_ICON_RESOURCE as *const u16, IMAGE_ICON, px, px, LR_DEFAULTCOLOR);
            if !icon.is_null() {
                SendMessageW(hwnd, WM_SETICON, which as usize, icon as isize);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn apply(_window: &tauri::WebviewWindow) {}
