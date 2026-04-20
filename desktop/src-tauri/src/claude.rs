//! Claude Code discovery + session-id handling.
//!
//! v3.7.0 corrections over v4.0:
//!   * Prefer the real `claude.exe` (PowerShell installer path OR npm's underlying exe)
//!     over the `.cmd` shim so the PTY runs the binary directly — faster startup,
//!     no cmd.exe wrapper, identical output stream.
//!   * New `read_session_id` command: the desktop reads `data/session-id.txt` written
//!     by the installer and shape-validates it before the frontend ever hands it to
//!     the PTY as an arg. No garbage ever reaches `--resume`.

use std::path::PathBuf;

/// Locate Claude Code on this machine. Prefers real .exe binaries over .cmd shims.
#[tauri::command]
pub fn find_claude() -> Result<String, String> {
    let home = home_dir().ok_or_else(|| "No home dir".to_string())?;

    // Real binaries first — PTY can exec directly.
    let candidates: Vec<PathBuf> = vec![
        home.join(".local").join("bin").join("claude.exe"),
        home.join("AppData").join("Roaming").join("npm")
            .join("node_modules").join("@anthropic-ai").join("claude-code")
            .join("bin").join("claude.exe"),
        home.join(".local").join("bin").join("claude"),
        // Fallback to shims — PTY will detect and wrap in cmd.exe /c.
        home.join("AppData").join("Roaming").join("npm").join("claude.cmd"),
        home.join("AppData").join("Roaming").join("npm").join("claude.ps1"),
    ];

    for c in &candidates {
        if c.exists() {
            return Ok(c.to_string_lossy().to_string());
        }
    }

    // Final fallback: `where claude` on PATH.
    if let Ok(output) = std::process::Command::new("where").arg("claude").output() {
        if output.status.success() {
            let first = String::from_utf8_lossy(&output.stdout)
                .lines().next().unwrap_or("").trim().to_string();
            if !first.is_empty() {
                return Ok(first);
            }
        }
    }

    Err("Claude Code not found on this machine".to_string())
}

/// Read the installer-written session id and validate its shape.
/// Returns the UUID string on success, `None` if the file is missing/empty/garbage.
/// Frontend will fall back to `--continue` when this returns `None`.
#[tauri::command]
pub fn read_session_id(project_dir: String) -> Option<String> {
    let path = PathBuf::from(&project_dir).join("data").join("session-id.txt");
    let raw = std::fs::read_to_string(&path).ok()?;

    // Strip BOM (if Notepad-edited), CR, LF, and surrounding whitespace.
    let cleaned = raw.trim_start_matches('\u{FEFF}').trim();

    if is_uuid_v4_shape(cleaned) {
        Some(cleaned.to_string())
    } else {
        None
    }
}

fn is_uuid_v4_shape(s: &str) -> bool {
    // 8-4-4-4-12 hex. Accepts any case. Does not verify v4 version nibble
    // (we write randomUUID which always produces v4, but stay lenient).
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

/// Reads `data/launch-config.json` for opt-in launch flags.
/// Returns false if file missing/malformed/key absent — never errors.
#[tauri::command]
pub fn read_skip_permissions(project_dir: String) -> bool {
    let path = PathBuf::from(&project_dir).join("data").join("launch-config.json");
    let raw = match std::fs::read_to_string(&path) { Ok(s) => s, Err(_) => return false };
    // Tiny manual probe — avoids pulling serde_json into this module just for one bool.
    // Looks for `"skipPermissions"` followed by colon, optional whitespace, then `true`.
    let needle = "\"skipPermissions\"";
    let idx = match raw.find(needle) { Some(i) => i + needle.len(), None => return false };
    let tail = raw[idx..].trim_start();
    let tail = tail.strip_prefix(':').unwrap_or(tail).trim_start();
    tail.starts_with("true")
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Returns true if Claude Code has any prior session for this project dir.
///
/// Claude Code stores per-project transcripts at
/// `~/.claude/projects/<encoded>/<session-uuid>.jsonl` where `<encoded>` is the
/// absolute project path with separators (`/`, `\`, `:`) and dots replaced by
/// `-`. When this returns false, the frontend should launch bare `claude`
/// (welcome screen) instead of `--continue` (which errors with "no sessions").
#[tauri::command]
pub fn has_any_session(project_dir: String) -> bool {
    let home = match home_dir() { Some(h) => h, None => return false };
    let trimmed = project_dir.trim_matches('\0').trim();
    if trimmed.is_empty() { return false; }

    let encoded = encode_project_path(trimmed);
    let dir = home.join(".claude").join("projects").join(&encoded);

    let entries = match std::fs::read_dir(&dir) { Ok(e) => e, Err(_) => return false };
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if name.ends_with(".jsonl") { return true; }
        }
    }
    false
}

fn encode_project_path(p: &str) -> String {
    // Normalize backslashes to forward slashes first, then map all of
    // `/`, `\`, `:`, `.` to `-`. Matches Claude Code's encoding.
    let mut out = String::with_capacity(p.len());
    for ch in p.chars() {
        match ch {
            '/' | '\\' | ':' | '.' => out.push('-'),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_shape_accepts_v4() {
        assert!(is_uuid_v4_shape("bf316b7a-536f-450d-b2fd-7b4e980df3bf"));
        assert!(is_uuid_v4_shape("BF316B7A-536F-450D-B2FD-7B4E980DF3BF"));
    }

    #[test]
    fn project_path_encoding_matches_claude() {
        // Claude Code encoding: replace /, \, :, . with -
        assert_eq!(
            encode_project_path("C:\\Users\\ctt03\\Desktop\\my-agent"),
            "C--Users-ctt03-Desktop-my-agent"
        );
        assert_eq!(
            encode_project_path("/home/user/agent.dev"),
            "-home-user-agent-dev"
        );
    }

    #[test]
    fn uuid_shape_rejects_junk() {
        assert!(!is_uuid_v4_shape(""));
        assert!(!is_uuid_v4_shape("session_legacy"));
        assert!(!is_uuid_v4_shape("bf316b7a-536f-450d-b2fd-7b4e9"));
        assert!(!is_uuid_v4_shape("bf316b7a536f450db2fd7b4e980df3bf"));
        // length 36 but non-hex
        assert!(!is_uuid_v4_shape("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"));
    }
}
