/**
 * The File System Access API is not in TypeScript's DOM lib. Declared here rather
 * than cast away with `any`, so the seam's one browser-specific dependency is
 * written down and checked.
 *
 * Chrome/Edge only — that is a decision (#21 Q4), not an oversight.
 */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle & { kind: 'file' | 'directory' }]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemHandle & { kind: 'file' | 'directory' }>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | string
}

interface SaveFilePickerOptions {
  suggestedName?: string
  id?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
