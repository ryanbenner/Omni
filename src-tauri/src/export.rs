use serde::Deserialize;
use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub input: String,
    pub output: String,
    pub in_sec: f64,
    pub out_sec: f64,
    pub mode: String,
    pub target_bytes: Option<u64>,
}

#[derive(Default)]
pub struct ExportState(pub Mutex<Option<CommandChild>>);

fn secs(v: f64) -> String {
    format!("{v:.3}")
}

pub fn discord_bitrate(target_bytes: u64, duration: f64) -> u64 {
    let raw = (target_bytes as f64 * 8.0 / duration) * 0.92 - 160_000.0;
    (raw.max(250_000.0)) as u64
}

pub fn build_args(req: &ExportRequest) -> Result<Vec<String>, String> {
    let duration = req.out_sec - req.in_sec;
    if !(duration > 0.0) {
        return Err("invalid trim range".into());
    }
    let mut a: Vec<String> = [
        "-progress", "pipe:1", "-nostats", "-hide_banner",
        "-ss", &secs(req.in_sec), "-to", &secs(req.out_sec), "-i", &req.input,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    match req.mode.as_str() {
        "fast" => a.extend(["-c", "copy"].map(String::from)),
        "precise" => a.extend(
            ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23", "-c:a", "copy"].map(String::from),
        ),
        "discord" => {
            let target = req.target_bytes.ok_or("discord mode needs a target size")?;
            let v = discord_bitrate(target, duration);
            a.extend(
                [
                    "-c:v", "h264_nvenc", "-preset", "p4",
                    "-b:v", &v.to_string(), "-maxrate", &v.to_string(),
                    "-bufsize", &(v * 2).to_string(),
                    "-c:a", "aac", "-b:a", "160k",
                ]
                .map(String::from),
            );
        }
        _ => return Err(format!("unknown export mode {}", req.mode)),
    }
    a.extend(["-movflags", "+faststart", "-y", &req.output].map(String::from));
    Ok(a)
}

#[tauri::command]
pub async fn export_clip(
    app: tauri::AppHandle,
    state: tauri::State<'_, ExportState>,
    req: ExportRequest,
) -> Result<(), String> {
    let args = build_args(&req)?;
    let duration = req.out_sec - req.in_sec;
    {
        let guard = state.0.lock().unwrap();
        if guard.is_some() {
            return Err("an export is already running".into());
        }
    }
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(child);

    let mut stderr_tail: Vec<String> = Vec::new();
    let mut code: Option<i32> = None;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line);
                // ffmpeg -progress emits out_time_ms in microseconds
                if let Some(v) = line.trim().strip_prefix("out_time_ms=") {
                    if let Ok(us) = v.parse::<f64>() {
                        let pct = ((us / 1_000_000.0) / duration * 100.0).clamp(0.0, 100.0);
                        let _ = app.emit("export-progress", serde_json::json!({ "percent": pct }));
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                stderr_tail.push(String::from_utf8_lossy(&line).into_owned());
                if stderr_tail.len() > 20 {
                    stderr_tail.remove(0);
                }
            }
            CommandEvent::Terminated(payload) => {
                code = payload.code;
            }
            _ => {}
        }
    }
    *state.0.lock().unwrap() = None;
    if code == Some(0) {
        let _ = app.emit("export-progress", serde_json::json!({ "percent": 100.0 }));
        Ok(())
    } else {
        // never leave a partial file behind
        let _ = std::fs::remove_file(&req.output);
        Err(if code.is_none() {
            "export cancelled".into()
        } else {
            format!("ffmpeg failed: {}", stderr_tail.join("\n"))
        })
    }
}

#[tauri::command]
pub fn cancel_export(state: tauri::State<'_, ExportState>) {
    if let Some(child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(mode: &str, target: Option<u64>) -> ExportRequest {
        ExportRequest {
            input: "C:\\v\\in.mp4".into(),
            output: "C:\\v\\in_clip.mp4".into(),
            in_sec: 1.5,
            out_sec: 6.5,
            mode: mode.into(),
            target_bytes: target,
        }
    }

    #[test]
    fn fast_args_stream_copy() {
        let a = build_args(&req("fast", None)).unwrap();
        assert_eq!(
            a,
            vec![
                "-progress", "pipe:1", "-nostats", "-hide_banner",
                "-ss", "1.500", "-to", "6.500", "-i", "C:\\v\\in.mp4",
                "-c", "copy",
                "-movflags", "+faststart", "-y", "C:\\v\\in_clip.mp4",
            ]
        );
    }

    #[test]
    fn precise_args_nvenc() {
        let a = build_args(&req("precise", None)).unwrap();
        assert_eq!(
            a,
            vec![
                "-progress", "pipe:1", "-nostats", "-hide_banner",
                "-ss", "1.500", "-to", "6.500", "-i", "C:\\v\\in.mp4",
                "-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23", "-c:a", "copy",
                "-movflags", "+faststart", "-y", "C:\\v\\in_clip.mp4",
            ]
        );
    }

    #[test]
    fn discord_args_rate_controlled() {
        let target = 50 * 1024 * 1024u64;
        let a = build_args(&req("discord", Some(target))).unwrap();
        let v = discord_bitrate(target, 5.0).to_string();
        assert!(a.windows(2).any(|w| w == ["-b:v".to_string(), v.clone()]));
        assert!(a.windows(2).any(|w| w == ["-c:a".to_string(), "aac".to_string()]));
        assert!(a.contains(&"h264_nvenc".to_string()));
    }

    #[test]
    fn discord_bitrate_math() {
        // 50mb over 5s: (52428800*8/5)*0.92 - 160000 = 77015193.6 -> 77_015_193
        assert_eq!(discord_bitrate(50 * 1024 * 1024, 5.0), 77_015_193);
        // tiny target over long duration floors at 250k
        assert_eq!(discord_bitrate(1024, 600.0), 250_000);
    }

    #[test]
    fn rejects_bad_ranges_and_modes() {
        let mut r = req("fast", None);
        r.out_sec = 1.5; // zero-length
        assert!(build_args(&r).is_err());
        assert!(build_args(&req("weird", None)).is_err());
        assert!(build_args(&req("discord", None)).is_err()); // missing target
    }
}
