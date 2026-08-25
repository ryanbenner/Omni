mod scan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance must be the first plugin so it can short-circuit
        // second launches before anything else initializes
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::{Emitter, Manager};
            let _ = app.emit("single-instance", argv);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_cli::init())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scan::scan_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
