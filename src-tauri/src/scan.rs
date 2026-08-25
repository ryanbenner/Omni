use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const VIDEO_EXTS: &[&str] = &["mp4", "mkv", "mov"];
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub path: String,
    pub kind: String,
    pub name: String,
    pub mtime: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub items: Vec<MediaItem>,
    pub start_index: usize,
}

pub fn kind_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if VIDEO_EXTS.contains(&ext.as_str()) {
        Some("video")
    } else if IMAGE_EXTS.contains(&ext.as_str()) {
        Some("image")
    } else {
        None
    }
}

pub fn sort_items(items: &mut [MediaItem]) {
    items.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
}

#[tauri::command]
pub fn scan_media(path: String) -> Result<ScanResult, String> {
    let launched = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("cannot open {path}: {e}"))?;
    // read the dir from the original path so item paths stay in user form;
    // canonicalize only for the start-index comparison below
    let dir = Path::new(&path).parent().ok_or("file has no parent directory")?;
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let Some(kind) = kind_for(&p) else { continue };
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        items.push(MediaItem {
            path: p.to_string_lossy().into_owned(),
            kind: kind.to_string(),
            name: entry.file_name().to_string_lossy().into_owned(),
            mtime,
        });
    }
    sort_items(&mut items);
    // canonicalize both sides so windows verbatim paths compare equal
    let start_index = items
        .iter()
        .position(|i| {
            Path::new(&i.path)
                .canonicalize()
                .map(|c| c == launched)
                .unwrap_or(false)
        })
        .unwrap_or(0);
    Ok(ScanResult { items, start_index })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    fn item(name: &str, mtime: u64) -> MediaItem {
        MediaItem {
            path: format!("/x/{name}"),
            kind: "video".into(),
            name: name.into(),
            mtime,
        }
    }

    #[test]
    fn classifies_extensions_case_insensitively() {
        assert_eq!(kind_for(Path::new("a.mp4")), Some("video"));
        assert_eq!(kind_for(Path::new("a.MKV")), Some("video"));
        assert_eq!(kind_for(Path::new("a.mov")), Some("video"));
        assert_eq!(kind_for(Path::new("a.JPG")), Some("image"));
        assert_eq!(kind_for(Path::new("a.jpeg")), Some("image"));
        assert_eq!(kind_for(Path::new("a.heic")), Some("image"));
        assert_eq!(kind_for(Path::new("a.txt")), None);
        assert_eq!(kind_for(Path::new("noext")), None);
    }

    #[test]
    fn sorts_newest_first_then_name() {
        let mut items = vec![item("b.mp4", 100), item("a.mp4", 300), item("c.mp4", 300)];
        sort_items(&mut items);
        let names: Vec<_> = items.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(names, vec!["a.mp4", "c.mp4", "b.mp4"]);
    }

    #[test]
    fn scan_filters_and_finds_start_index() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["clip.mp4", "photo.jpg", "notes.txt"] {
            File::create(dir.path().join(name)).unwrap();
        }
        let launched = dir.path().join("photo.jpg");
        let result = scan_media(launched.to_string_lossy().into_owned()).unwrap();
        assert_eq!(result.items.len(), 2); // txt filtered out
        assert_eq!(result.items[result.start_index].name, "photo.jpg");
    }

    #[test]
    fn scan_errors_on_missing_file() {
        assert!(scan_media("/definitely/not/a/real/file.mp4".into()).is_err());
    }

    #[test]
    fn item_paths_use_caller_directory_form_not_canonicalized() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["clip.mp4", "photo.jpg"] {
            File::create(dir.path().join(name)).unwrap();
        }
        // build the launched path without canonicalizing, so it stays in
        // whatever form the caller used (e.g. windows verbatim \\?\ prefix
        // would otherwise leak into every returned item.path)
        let launched = dir.path().join("photo.jpg");
        let result = scan_media(launched.to_string_lossy().into_owned()).unwrap();
        let expected_prefix = dir.path().to_string_lossy().into_owned();
        for item in &result.items {
            assert!(
                item.path.starts_with(&expected_prefix),
                "item path {} did not start with caller directory form {}",
                item.path,
                expected_prefix
            );
        }
    }
}
