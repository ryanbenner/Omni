export function sepOf(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

// every ancestor directory of a file path, drive/root first.
// windows roots keep their trailing separator ("C:\\"), deeper dirs do not.
export function ancestorDirs(filePath: string): string[] {
  const sep = sepOf(filePath);
  const parts = filePath.split(sep).filter(Boolean);
  parts.pop();
  const out: string[] = [];
  let acc = "";
  if (sep === "/") {
    out.push("/");
    for (const p of parts) {
      acc += "/" + p;
      out.push(acc);
    }
  } else {
    for (const [i, p] of parts.entries()) {
      if (i === 0) {
        acc = p + "\\";
        out.push(acc);
      } else {
        acc = acc.endsWith("\\") ? acc + p : acc + "\\" + p;
        out.push(acc);
      }
    }
  }
  return out;
}

export function parentDir(filePath: string): string {
  const dirs = ancestorDirs(filePath);
  return dirs[dirs.length - 1] ?? filePath;
}

// shadowplay names repeat the game in every file; the date is the signal
export function displayLabel(name: string, isFile: boolean): string {
  if (!isFile) return name;
  return name.replace(/^([A-Za-z0-9]+) (?=\d{4}\.)/, "");
}

export function joinPath(dir: string, name: string): string {
  const sep = sepOf(dir);
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
