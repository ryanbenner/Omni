use serde::Serialize;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub path: String,
    pub name: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub folders: Vec<FolderEntry>,
    pub files: Vec<crate::scan::MediaItem>,
}

#[tauri::command]
pub fn list_drives() -> Vec<DriveInfo> {
    #[cfg(windows)]
    {
        ('A'..='Z')
            .filter_map(|c| {
                let path = format!("{c}:\\");
                if std::path::Path::new(&path).exists() {
                    Some(DriveInfo { path, name: format!("{c}:") })
                } else {
                    None
                }
            })
            .collect()
    }
    #[cfg(not(windows))]
    {
        // dev machines: expose root and home as pseudo-drives
        let mut v = vec![DriveInfo { path: "/".into(), name: "Root".into() }];
        if let Ok(home) = std::env::var("HOME") {
            v.push(DriveInfo { path: home, name: "Home".into() });
        }
        v
    }
}

#[tauri::command]
pub fn read_dir_entries(path: String) -> Result<DirListing, String> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            // FILE_ATTRIBUTE_HIDDEN = 0x2, FILE_ATTRIBUTE_SYSTEM = 0x4
            if let Ok(meta) = entry.metadata() {
                if meta.file_attributes() & 0x6 != 0 {
                    continue;
                }
            }
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            folders.push(FolderEntry {
                path: entry.path().to_string_lossy().into_owned(),
                name,
            });
        } else if let Some(item) = crate::scan::media_item_from_entry(&entry) {
            files.push(item);
        }
    }
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    crate::scan::sort_items(&mut files);
    Ok(DirListing { folders, files })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir, File};

    #[test]
    fn drives_never_empty() {
        assert!(!list_drives().is_empty());
    }

    #[test]
    fn listing_splits_and_sorts() {
        let dir = tempfile::tempdir().unwrap();
        create_dir(dir.path().join("zeta")).unwrap();
        create_dir(dir.path().join("Alpha")).unwrap();
        create_dir(dir.path().join(".hidden")).unwrap();
        File::create(dir.path().join("clip.mp4")).unwrap();
        File::create(dir.path().join("notes.txt")).unwrap();
        File::create(dir.path().join(".ds_thing.png")).unwrap();
        let out = read_dir_entries(dir.path().to_string_lossy().into_owned()).unwrap();
        let names: Vec<_> = out.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "zeta"]); // case-insensitive sort, hidden skipped
        assert_eq!(out.files.len(), 1);
        assert_eq!(out.files[0].name, "clip.mp4");
    }

    #[test]
    fn listing_errors_on_missing_dir() {
        assert!(read_dir_entries("/definitely/not/here".into()).is_err());
    }
}
