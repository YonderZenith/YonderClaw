//! QIS autoconnect bootstrap.
//!
//! v3.6.10 launch.bat ran `npx tsx scripts/qis-autoconnect.ts` before starting
//! Claude when `data/qis-deposit-log.json` was missing. v3.7.0 launches the
//! Tauri desktop directly, so we replicate that hook here and stream output
//! into the same `pty-output` channel the terminal renders. Result: the user
//! sees the autoconnect handshake in their main terminal pane on first launch,
//! identical to the legacy flow.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn run_autoconnect_if_needed(app: AppHandle, project_dir: String) -> Result<bool, String> {
    let project_dir = project_dir.trim_matches('\0').trim().to_string();
    if project_dir.is_empty() {
        return Err("project_dir required".into());
    }
    let project = PathBuf::from(&project_dir);
    if !project.is_dir() {
        return Err(format!("project_dir does not exist: {}", project_dir));
    }

    let sentinel = project.join("data").join("qis-deposit-log.json");
    if sentinel.exists() {
        return Ok(false);
    }

    let script = project.join("scripts").join("qis-autoconnect.ts");
    if !script.exists() {
        // Older agents (pre-3.6.10) don't have the script. Nothing to do.
        return Ok(false);
    }

    emit_line(&app, "\r\n  Connecting to YonderClaw intelligence network...\r\n");

    // npx is a .cmd shim on Windows — invoke through cmd.exe so we don't get
    // ENOENT when looking for an .exe. PATH inherits from the parent process.
    let npx = if cfg!(windows) { "npx.cmd" } else { "npx" };
    let mut child = match Command::new(npx)
        .arg("tsx")
        .arg("scripts/qis-autoconnect.ts")
        .current_dir(&project)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            // Surface the failure in-terminal but don't block launch — the
            // agent is still usable; QIS can be retried on next boot.
            emit_line(&app, &format!("  [autoconnect] spawn failed: {}\r\n", e));
            return Ok(false);
        }
    };

    if let Some(out) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || stream_to_pty(app_clone, out));
    }
    if let Some(err) = child.stderr.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || stream_to_pty(app_clone, err));
    }

    match child.wait() {
        Ok(status) => {
            if status.success() {
                emit_line(&app, "  QIS handshake complete.\r\n\r\n");
            } else {
                emit_line(&app, &format!(
                    "  [autoconnect] exited {} — continuing without QIS for this session.\r\n\r\n",
                    status.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into())
                ));
            }
        }
        Err(e) => {
            emit_line(&app, &format!("  [autoconnect] wait failed: {}\r\n\r\n", e));
        }
    }

    Ok(true)
}

fn stream_to_pty<R: std::io::Read + Send + 'static>(app: AppHandle, stream: R) {
    let reader = BufReader::new(stream);
    for line in reader.lines().flatten() {
        let _ = app.emit("pty-output", &format!("  {}\r\n", line));
    }
}

fn emit_line(app: &AppHandle, text: &str) {
    let _ = app.emit("pty-output", text);
}

// silence unused warning on non-windows builds
#[allow(dead_code)]
fn _path_marker(_p: &Path) {}
