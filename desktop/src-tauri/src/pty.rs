//! ConPTY bridge between the front-end xterm.js and a child process
//! (normally `claude --resume <id>` running in the agent project dir).
//!
//! v3.7.0 corrections over v4.0:
//!   * Pass `project_dir` as cwd — NOT the user's home dir. v4.0's terminal panel
//!     spawned claude from `~` so the CWD didn't match the encoded-path that
//!     `claude --continue` hashes on; resume could silently pick the wrong session.
//!   * Reject empty cwd with an error rather than defaulting to home.
//!   * Same .cmd detection for shim fallbacks.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            writer: Mutex::new(None),
            master: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    shell: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    cwd: String,
) -> Result<(), String> {
    // Strip null bytes that can sneak in from JS strings.
    let shell = shell.trim_matches('\0').to_string();
    let args: Vec<String> = args.iter()
        .map(|a| a.trim_matches('\0').to_string())
        .filter(|a| !a.is_empty())
        .collect();
    let cwd = cwd.trim_matches('\0').to_string();

    if cwd.is_empty() {
        return Err("cwd required — pass the agent project directory".into());
    }
    if !Path::new(&cwd).is_dir() {
        return Err(format!("cwd does not exist: {}", cwd));
    }
    if !Path::new(&shell).exists() {
        return Err(format!("claude binary not found: {}", shell));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // `.cmd`/`.bat` need cmd.exe /c; `.exe` can be exec'd directly.
    let lower = shell.to_lowercase();
    let mut cmd = if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/c");
        c.arg(&shell);
        for a in &args { c.arg(a); }
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        for a in &args { c.arg(a); }
        c
    };

    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.master.lock().unwrap() = Some(pair.master);

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = app_handle.emit("pty-exit", ());
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit("pty-output", &output);
                }
                Err(_) => {
                    let _ = app_handle.emit("pty-exit", ());
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, data: String) -> Result<(), String> {
    if let Some(writer) = state.writer.lock().unwrap().as_mut() {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(state: tauri::State<'_, PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(master) = state.master.lock().unwrap().as_ref() {
        master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
