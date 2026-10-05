use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const VIDEO_EXTS: &[&str] = &["mp4", "mkv", "mov"];
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
// omni's own layout file; listed in the tree, never a next/prev neighbor
const COLLAGE_EXTS: &[&str] = &["collage"];
const PDF_EXTS: &[&str] = &["pdf"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub path: String,
    pub kind: String,
    pub name: String,
    pub mtime: u64,
    pub size: u64,
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
    } else if COLLAGE_EXTS.contains(&ext.as_str()) {
        Some("collage")
    } else if PDF_EXTS.contains(&ext.as_str()) {
        Some("pdf")
    } else {
        None
    }
}

pub fn sort_items(items: &mut [MediaItem]) {
    items.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
}

pub fn media_item_from_entry(entry: &std::fs::DirEntry) -> Option<MediaItem> {
    let p = entry.path();
    if !p.is_file() {
        return None;
    }
    let kind = kind_for(&p)?;
    let meta = entry.metadata().ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    Some(MediaItem {
        path: p.to_string_lossy().into_owned(),
        kind: kind.to_string(),
        name: entry.file_name().to_string_lossy().into_owned(),
        mtime,
        size,
    })
}

#[tauri::command]
pub fn scan_media(path: String, show_hidden: bool) -> Result<ScanResult, String> {
    let launched = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("cannot open {path}: {e}"))?;
    // read the dir from the original path so item paths stay in user form;
    // canonicalize only for the start-index comparison below
    let dir = Path::new(&path).parent().ok_or("file has no parent directory")?;
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let filtered =
            crate::browse::is_system(&entry) || (!show_hidden && crate::browse::is_hidden(&entry, &name));
        // the launched file always shows, hidden or not
        if filtered && entry.path().canonicalize().map(|c| c != launched).unwrap_or(true) {
            continue;
        }
        if let Some(item) = media_item_from_entry(&entry) {
            if item.kind != "collage" {
                items.push(item);
            }
        }
    }
    sort_items(&mut items);
    // items are built from the caller's own directory string, so the launched
    // file matches by text on every ordinary open; canonicalizing each item is
    // the fallback for verbatim or symlinked spellings, and it is the expensive
    // part on large folders because this scan also runs on every window focus
    let start_index = items
        .iter()
        .position(|i| same_user_path(&i.path, &path))
        .or_else(|| {
            items.iter().position(|i| {
                Path::new(&i.path)
                    .canonicalize()
                    .map(|c| c == launched)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(0);
    Ok(ScanResult { items, start_index })
}

// separator-agnostic, and case-insensitive where the filesystem is
fn same_user_path(a: &str, b: &str) -> bool {
    let a = a.replace('\\', "/");
    let b = b.replace('\\', "/");
    if cfg!(windows) {
        a.eq_ignore_ascii_case(&b)
    } else {
        a == b
    }
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
            size: 0,
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
        assert_eq!(kind_for(Path::new("wall.collage")), Some("collage"));
        assert_eq!(kind_for(Path::new("a.pdf")), Some("pdf"));
        assert_eq!(kind_for(Path::new("a.PDF")), Some("pdf"));
        assert_eq!(kind_for(Path::new("a.txt")), None);
        assert_eq!(kind_for(Path::new("noext")), None);
    }

    #[test]
    fn scan_skips_collage_files() {
        let dir = tempfile::tempdir().unwrap();
        let pic = dir.path().join("a.jpg");
        File::create(&pic).unwrap();
        File::create(dir.path().join("wall.collage")).unwrap();
        let out = scan_media(pic.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(out.items.len(), 1);
        assert_eq!(out.items[0].name, "a.jpg");
    }

    #[test]
    fn scan_lists_pdfs_as_their_own_kind() {
        let dir = tempfile::tempdir().unwrap();
        File::create(dir.path().join("doc.pdf")).unwrap();
        File::create(dir.path().join("photo.jpg")).unwrap();
        let launched = dir.path().join("doc.pdf");
        let result = scan_media(launched.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(result.items.len(), 2);
        assert_eq!(result.items[result.start_index].kind, "pdf");
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
        let result = scan_media(launched.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(result.items.len(), 2); // txt filtered out
        assert_eq!(result.items[result.start_index].name, "photo.jpg");
    }

    #[test]
    fn same_user_path_ignores_separator_style_and_windows_case() {
        assert!(same_user_path("C:\\Videos\\a.mp4", "C:/Videos/a.mp4"));
        assert!(!same_user_path("C:/Videos/a.mp4", "C:/Videos/b.mp4"));
        assert_eq!(same_user_path("C:/Videos/A.MP4", "C:/Videos/a.mp4"), cfg!(windows));
    }

    #[test]
    fn scan_finds_the_start_index_by_text_for_a_forward_slash_launch() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["clip.mp4", "photo.jpg"] {
            File::create(dir.path().join(name)).unwrap();
        }
        // the caller's spelling may differ from the directory walk's only in
        // separators; the text match must still land on the launched file
        let launched = format!("{}/photo.jpg", dir.path().to_string_lossy());
        let result = scan_media(launched, false).unwrap();
        assert_eq!(result.items[result.start_index].name, "photo.jpg");
    }

    #[test]
    fn scan_errors_on_missing_file() {
        assert!(scan_media("/definitely/not/a/real/file.mp4".into(), false).is_err());
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
        let result = scan_media(launched.to_string_lossy().into_owned(), false).unwrap();
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

    #[test]
    fn scan_hides_dotfiles_unless_asked_but_always_keeps_the_launched_file() {
        let dir = tempfile::tempdir().unwrap();
        let pic = dir.path().join("a.jpg");
        let dot = dir.path().join(".b.jpg");
        File::create(&pic).unwrap();
        File::create(&dot).unwrap();
        let out = scan_media(pic.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(out.items.len(), 1);
        let out = scan_media(pic.to_string_lossy().into_owned(), true).unwrap();
        assert_eq!(out.items.len(), 2);
        // opened from explorer while hidden: still the file the user chose
        let out = scan_media(dot.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(out.items.len(), 2);
        assert_eq!(out.items[out.start_index].name, ".b.jpg");
    }
}
