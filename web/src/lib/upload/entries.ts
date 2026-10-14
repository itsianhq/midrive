/** A file plus the folder path (relative to the drop target) it should land in. */
export type UploadEntry = { file: File; dirs: string[] }

export function entriesFromFileList(files: FileList | File[]): UploadEntry[] {
  return Array.from(files).map((file) => {
    // Set when picked through <input webkitdirectory>
    const rel = file.webkitRelativePath
    const dirs = rel ? rel.split("/").slice(0, -1) : []
    return { file, dirs }
  })
}

function readAllEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        next()
      }, reject)
    next()
  })
}

async function walk(
  entry: FileSystemEntry,
  dirs: string[],
  out: UploadEntry[]
) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    out.push({ file, dirs })
  } else if (entry.isDirectory) {
    const children = await readAllEntries(
      (entry as FileSystemDirectoryEntry).createReader()
    )
    for (const child of children) await walk(child, [...dirs, entry.name], out)
  }
}

/** Expand a drop (which may include whole folders) into upload entries. */
export async function entriesFromDataTransfer(
  dt: DataTransfer
): Promise<UploadEntry[]> {
  const roots = Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
  if (roots.length === 0 || roots.some((e) => !e))
    return entriesFromFileList(dt.files)

  const out: UploadEntry[] = []
  for (const entry of roots) await walk(entry!, [], out)
  return out
}
