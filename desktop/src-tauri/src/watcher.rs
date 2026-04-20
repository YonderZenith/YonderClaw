//! File watcher — monitors data/dashboard.json + data/logs/*.jsonl and emits
//! events to the frontend via Tauri's event bus. Uses ReadDirectoryChangesW
//! on Windows via the `notify` crate (<50ms latency).
//!
//! Shutdown: watch_project is idempotent — calling it again with a new project
//! dir signals the prior watcher to stop, drops the prior `Watcher` (which
//! tears down the OS handles), and spins up a fresh one. Window close also
//! triggers the stop via the AtomicBool.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

struct WatcherHandle {
    stop: Arc<AtomicBool>,
    // Holding the Watcher keeps the OS handle alive; dropping it stops events.
    _watcher: RecommendedWatcher,
}

static ACTIVE: OnceLock<Mutex<Option<WatcherHandle>>> = OnceLock::new();

fn active() -> &'static Mutex<Option<WatcherHandle>> {
    ACTIVE.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub fn watch_project(app: AppHandle, project_dir: String) -> Result<(), String> {
    let project_dir = project_dir.trim_matches('\0').trim().to_string();
    let data_dir = PathBuf::from(&project_dir).join("data");
    let dashboard_path = data_dir.join("dashboard.json");
    let logs_dir = data_dir.join("logs");

    if !data_dir.is_dir() {
        return Err(format!("data dir not found: {:?}", data_dir));
    }

    // Stop any prior watcher (signal first so its loop exits, then drop watcher).
    if let Ok(mut slot) = active().lock() {
        if let Some(prev) = slot.take() {
            prev.stop.store(true, Ordering::SeqCst);
            drop(prev);
        }
    }

    // Emit whatever dashboard.json has right now so the UI isn't blank at startup.
    if dashboard_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&dashboard_path) {
            let _ = app.emit("dashboard-updated", &content);
        }
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = stop.clone();
    let app_handle = app.clone();
    let dash_path_owned = dashboard_path.clone();

    let (tx, rx) = mpsc::channel::<Event>();

    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            let _ = tx.send(ev);
        }
    }).map_err(|e| format!("watcher create failed: {}", e))?;

    watcher.watch(&data_dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch data/ failed: {}", e))?;
    if logs_dir.exists() {
        let _ = watcher.watch(&logs_dir, RecursiveMode::NonRecursive);
    }

    std::thread::spawn(move || {
        loop {
            if stop_for_thread.load(Ordering::SeqCst) { break; }
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(ev) => match ev.kind {
                    EventKind::Modify(_) | EventKind::Create(_) => {
                        if ev.paths.iter().any(|p| p.ends_with("dashboard.json")) {
                            if let Ok(content) = std::fs::read_to_string(&dash_path_owned) {
                                let _ = app_handle.emit("dashboard-updated", &content);
                            }
                        }
                        if ev.paths.iter().any(|p|
                            p.extension().map_or(false, |e| e == "jsonl")
                        ) {
                            let _ = app_handle.emit("log-updated", ());
                        }
                    }
                    _ => {}
                },
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    if let Ok(mut slot) = active().lock() {
        *slot = Some(WatcherHandle { stop, _watcher: watcher });
    }

    Ok(())
}
