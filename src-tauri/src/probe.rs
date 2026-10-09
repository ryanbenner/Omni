use serde::Serialize;
use tauri_plugin_shell::ShellExt;

/// why the webview couldn't play a video, judged from ffmpeg's read of it
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlayFailure {
    Unreadable,
    Mkv,
    Hevc,
    Unsupported { codec: String },
    Damaged,
}

// codecs the webview decodes on its own; one of these failing means the file is bad
const PLAYABLE: [&str; 4] = ["h264", "vp8", "vp9", "av1"];

// none when the output holds no read of the file at all, e.g. ffmpeg itself broke
pub fn classify(stderr: &str) -> Option<PlayFailure> {
    if let Some(line) = stderr.lines().find(|l| l.contains("Error opening input:")) {
        return Some(
            if line.contains("No such file") || line.contains("Permission denied") {
                PlayFailure::Unreadable
            } else {
                PlayFailure::Damaged
            },
        );
    }
    if !stderr.lines().any(|l| l.starts_with("Input #0, ")) {
        return None;
    }
    let matroska = stderr.lines().any(|l| l.starts_with("Input #0, matroska"));
    let codec = stderr
        .lines()
        .find_map(|l| l.split_once(": Video: "))
        .and_then(|(_, rest)| rest.split([' ', ',']).next())
        .unwrap_or("");
    let webm_codec = matches!(codec, "vp8" | "vp9" | "av1");
    Some(if matroska && !webm_codec {
        PlayFailure::Mkv
    } else if codec == "hevc" {
        PlayFailure::Hevc
    } else if !codec.is_empty() && !PLAYABLE.contains(&codec) {
        PlayFailure::Unsupported {
            codec: codec.into(),
        }
    } else {
        PlayFailure::Damaged
    })
}

#[tauri::command]
pub async fn probe_video(app: tauri::AppHandle, path: String) -> Result<PlayFailure, String> {
    // with no output file ffmpeg reads only the headers, prints them and exits 1
    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(["-hide_banner", "-i", &path])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    classify(&String::from_utf8_lossy(&out.stderr))
        .ok_or_else(|| "ffmpeg couldn't read the file".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ffmpeg -hide_banner -i on the broken shadowplay clip from #38
    const DAMAGED_H264: &str = r#"[in#0 @ 0000024ca646f540] UDTA parsing failed retrying raw
[h264 @ 0000024ca6472040] Failed to parse header of NALU (type 0): "Invalid data found when processing input". Skipping NALU.
[h264 @ 0000024ca6472040] Frame num change from 17 to 18
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:\Users\ryan\Videos\NVIDIA\R6\clip.DVR.mp4':
  Metadata:
    major_brand     : mp42
  Duration: 00:01:30.27, start: 0.000000, bitrate: 34975 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 2560x1440 [SAR 1:1 DAR 16:9], 34776 kb/s, 30 fps, 30 tbr, 90k tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s (default)
At least one output file must be specified
"#;

    fn opened(format: &str, video: &str) -> String {
        format!(
            "Input #0, {format}, from 'C:\\v\\a':\n  Duration: 00:00:01.00, start: 0.000000, bitrate: 100 kb/s\n  Stream #0:0[0x1](und): Video: {video}, yuv420p(tv, progressive), 320x240, 25 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp\nAt least one output file must be specified\n"
        )
    }

    fn open_error(reason: &str) -> String {
        format!(
            "[in#0 @ 0x600001] Error opening input: {reason}\nError opening input file C:\\v\\a.mp4.\nError opening input files: {reason}\n"
        )
    }

    #[test]
    fn h264_the_webview_rejected_is_damaged() {
        assert_eq!(classify(DAMAGED_H264), Some(PlayFailure::Damaged));
    }

    #[test]
    fn hevc_in_mp4_needs_the_extension() {
        let s = opened("mov,mp4,m4a,3gp,3g2,mj2", "hevc (Main) (hvc1 / 0x31637668)");
        assert_eq!(classify(&s), Some(PlayFailure::Hevc));
    }

    #[test]
    fn mkv_with_h264_or_hevc_is_the_container() {
        assert_eq!(
            classify(&opened("matroska,webm", "h264 (High)")),
            Some(PlayFailure::Mkv)
        );
        assert_eq!(
            classify(&opened("matroska,webm", "hevc (Main)")),
            Some(PlayFailure::Mkv)
        );
    }

    #[test]
    fn webm_codecs_in_matroska_are_not_blamed_on_the_container() {
        assert_eq!(
            classify(&opened("matroska,webm", "vp9 (Profile 0)")),
            Some(PlayFailure::Damaged)
        );
    }

    #[test]
    fn other_codecs_are_named() {
        let s = opened(
            "mov,mp4,m4a,3gp,3g2,mj2",
            "mpeg4 (Simple Profile) (mp4v / 0x7634706D)",
        );
        assert_eq!(
            classify(&s),
            Some(PlayFailure::Unsupported {
                codec: "mpeg4".into()
            })
        );
    }

    #[test]
    fn missing_or_locked_files_are_unreadable() {
        assert_eq!(
            classify(&open_error("No such file or directory")),
            Some(PlayFailure::Unreadable)
        );
        assert_eq!(
            classify(&open_error("Permission denied")),
            Some(PlayFailure::Unreadable)
        );
    }

    #[test]
    fn a_file_ffmpeg_cannot_parse_is_damaged() {
        let s = format!(
            "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x600002] moov atom not found\n{}",
            open_error("Invalid data found when processing input")
        );
        assert_eq!(classify(&s), Some(PlayFailure::Damaged));
    }

    #[test]
    fn output_without_a_read_of_the_file_is_no_verdict() {
        assert_eq!(classify(""), None);
        assert_eq!(classify("Illegal instruction\n"), None);
    }

    #[test]
    fn serializes_as_a_tagged_kind() {
        let v = serde_json::to_value(PlayFailure::Unsupported {
            codec: "mpeg4".into(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "kind": "unsupported", "codec": "mpeg4" })
        );
        let v = serde_json::to_value(PlayFailure::Damaged).unwrap();
        assert_eq!(v, serde_json::json!({ "kind": "damaged" }));
    }
}
