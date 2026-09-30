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
    #[cfg(target_os = "macos")]
    {
        // home first, then every mounted volume; the boot volume shows up
        // in /Volumes as a symlink so it needs no separate entry
        let mut v = Vec::new();
        if let Ok(home) = std::env::var("HOME") {
            v.push(DriveInfo { path: home, name: "Home".into() });
        }
        let mut vols: Vec<DriveInfo> = std::fs::read_dir("/Volumes")
            .map(|rd| {
                rd.flatten()
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().into_owned();
                        if name.starts_with('.') {
                            return None;
                        }
                        Some(DriveInfo {
                            path: e.path().to_string_lossy().into_owned(),
                            name,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        vols.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        v.extend(vols);
        if v.is_empty() {
            v.push(DriveInfo { path: "/".into(), name: "Root".into() });
        }
        v
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        // dev machines: expose root and home as pseudo-drives
        let mut v = vec![DriveInfo { path: "/".into(), name: "Root".into() }];
        if let Ok(home) = std::env::var("HOME") {
            v.push(DriveInfo { path: home, name: "Home".into() });
        }
        v
    }
}

#[cfg(windows)]
fn attrs(entry: &std::fs::DirEntry) -> u32 {
    use std::os::windows::fs::MetadataExt;
    entry.metadata().map(|m| m.file_attributes()).unwrap_or(0)
}

// FILE_ATTRIBUTE_SYSTEM = 0x4: never listed, like explorer's default
pub fn is_system(entry: &std::fs::DirEntry) -> bool {
    #[cfg(windows)]
    {
        attrs(entry) & 0x4 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = entry;
        false
    }
}

// dotfiles everywhere, plus FILE_ATTRIBUTE_HIDDEN = 0x2 on windows
pub fn is_hidden(entry: &std::fs::DirEntry, name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        attrs(entry) & 0x2 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = entry;
        false
    }
}

#[tauri::command]
pub fn read_dir_entries(path: String, show_hidden: bool) -> Result<DirListing, String> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_system(&entry) || (!show_hidden && is_hidden(&entry, &name)) {
            continue;
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

#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use clipboard_win::{formats, Clipboard, Setter};
        // filelist's setter takes an unsized slice, so open the clipboard
        // explicitly and write through the trait
        let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
        let files: [String; 1] = [path];
        formats::FileList
            .write_clipboard(&files)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("copy to clipboard is available on windows only".into())
    }
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    // recycle bin / trash, never a permanent delete
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_file(path: String, new_name: String) -> Result<String, String> {
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("invalid file name".into());
    }
    let p = std::path::Path::new(&path);
    let dir = p.parent().ok_or("file has no parent directory")?;
    let dest = dir.join(&new_name);
    if dest.exists() {
        return Err(format!("{new_name} already exists"));
    }
    std::fs::rename(p, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir, File};

    #[test]
    fn rename_moves_within_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("old.mp4");
        File::create(&src).unwrap();
        let out = rename_file(src.to_string_lossy().into_owned(), "new.mp4".into()).unwrap();
        assert!(out.ends_with("new.mp4"));
        assert!(dir.path().join("new.mp4").exists());
        assert!(!src.exists());
    }

    #[test]
    fn rename_rejects_bad_names_and_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.mp4");
        File::create(&src).unwrap();
        File::create(dir.path().join("b.mp4")).unwrap();
        let s = src.to_string_lossy().into_owned();
        assert!(rename_file(s.clone(), "".into()).is_err());
        assert!(rename_file(s.clone(), "x/y.mp4".into()).is_err());
        assert!(rename_file(s.clone(), "x\\y.mp4".into()).is_err());
        assert!(rename_file(s, "b.mp4".into()).is_err());
        assert!(src.exists()); // untouched after every rejection
    }

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
        let out = read_dir_entries(dir.path().to_string_lossy().into_owned(), false).unwrap();
        let names: Vec<_> = out.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "zeta"]); // case-insensitive sort, hidden skipped
        assert_eq!(out.files.len(), 1);
        assert_eq!(out.files[0].name, "clip.mp4");
    }

    #[test]
    fn listing_errors_on_missing_dir() {
        assert!(read_dir_entries("/definitely/not/here".into(), false).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_drives_have_home_and_unique_paths() {
        let drives = list_drives();
        assert!(drives.iter().any(|d| d.name == "Home"));
        assert!(!drives.iter().any(|d| d.name == "Root")); // real volumes, not the dev fallback
        let mut paths: Vec<_> = drives.iter().map(|d| d.path.clone()).collect();
        paths.sort();
        paths.dedup();
        assert_eq!(paths.len(), drives.len()); // no duplicate volumes
    }

    fn file_names(dir: &std::path::Path, show_hidden: bool) -> Vec<String> {
        let mut v: Vec<String> = read_dir_entries(dir.to_string_lossy().into_owned(), show_hidden)
            .unwrap()
            .files
            .into_iter()
            .map(|f| f.name)
            .collect();
        v.sort();
        v
    }

    #[test]
    fn dotfiles_are_hidden_unless_asked() {
        let dir = tempfile::tempdir().unwrap();
        File::create(dir.path().join("a.jpg")).unwrap();
        File::create(dir.path().join(".b.jpg")).unwrap();
        assert_eq!(file_names(dir.path(), false), vec!["a.jpg"]);
        assert_eq!(file_names(dir.path(), true), vec![".b.jpg", "a.jpg"]);
    }

    #[test]
    fn dot_folders_follow_the_same_rule() {
        let dir = tempfile::tempdir().unwrap();
        create_dir(dir.path().join(".secret")).unwrap();
        create_dir(dir.path().join("pics")).unwrap();
        let names = |show: bool| -> Vec<String> {
            let mut v: Vec<String> = read_dir_entries(dir.path().to_string_lossy().into_owned(), show)
                .unwrap()
                .folders
                .into_iter()
                .map(|f| f.name)
                .collect();
            v.sort();
            v
        };
        assert_eq!(names(false), vec!["pics"]);
        assert_eq!(names(true), vec![".secret", "pics"]);
    }

    #[test]
    fn is_hidden_reads_the_name_and_is_system_is_false_for_plain_files() {
        let dir = tempfile::tempdir().unwrap();
        File::create(dir.path().join(".dot.jpg")).unwrap();
        File::create(dir.path().join("plain.jpg")).unwrap();
        for entry in std::fs::read_dir(dir.path()).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            assert_eq!(is_hidden(&entry, &name), name.starts_with('.'));
            assert!(!is_system(&entry));
        }
    }

    // attrib is always on the windows path; the ci runner is windows-latest
    #[cfg(windows)]
    #[test]
    fn windows_hidden_shows_on_request_and_system_never_does() {
        use std::process::Command;
        let dir = tempfile::tempdir().unwrap();
        let h = dir.path().join("h.jpg");
        let s = dir.path().join("s.jpg");
        File::create(&h).unwrap();
        File::create(&s).unwrap();
        assert!(Command::new("attrib").arg("+h").arg(&h).status().unwrap().success());
        assert!(Command::new("attrib").arg("+s").arg(&s).status().unwrap().success());
        assert_eq!(file_names(dir.path(), false), Vec::<String>::new());
        assert_eq!(file_names(dir.path(), true), vec!["h.jpg"]);
    }
}
