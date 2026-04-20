mod autoconnect;
mod claude;
mod pty;
mod watcher;

use pty::PtyState;

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default()
}

/// Returns the agent project directory as provided by the installer's launch env
/// (`YONDERCLAW_PROJECT_DIR`). Returns `None` when the binary was launched
/// stand-alone (desktop shortcut, Start menu) — frontend then shows the picker.
#[tauri::command]
fn get_project_dir() -> Option<String> {
    let dir = std::env::var("YONDERCLAW_PROJECT_DIR").ok()?;
    let trimmed = dir.trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::new())
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            get_project_dir,
            autoconnect::run_autoconnect_if_needed,
            claude::find_claude,
            claude::read_session_id,
            claude::has_any_session,
            claude::read_skip_permissions,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            watcher::watch_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
