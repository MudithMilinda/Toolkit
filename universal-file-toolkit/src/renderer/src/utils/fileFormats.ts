export type FileCategory = 'image' | 'document' | 'video' | 'audio' | 'unknown'
export interface FileOperation {
  id: string
  label: string
  icon: string
}
const entries = (values: string[][]): FileOperation[] =>
  values.map(([id, label]) => ({ id, label, icon: id }))
const operationMap: Record<FileCategory, FileOperation[]> = {
  image: entries([
    ['png', 'PNG'],
    ['pdf', 'PDF'],
    ['webp', 'WEBP'],
    ['heic', 'HEIC'],
    ['tiff', 'TIFF'],
    ['avif', 'AVIF'],
    ['jpg', 'JPG']
  ]),
  document: entries([
    ['png', 'PNG'],
    ['jpg', 'JPG'],
    ['merge', 'Merge'],
    ['split', 'Split'],
    ['compress', 'Compress'],
    ['extract', 'Extract pages']
  ]),
  video: entries([
    ['mp4', 'MP4'],
    ['mp3', 'MP3'],
    ['gif', 'GIF'],
    ['mov', 'MOV'],
    ['webm', 'WEBM'],
    ['mkv', 'MKV'],
    ['avi', 'AVI']
  ]),
  audio: entries([
    ['mp3', 'MP3'],
    ['wav', 'WAV'],
    ['aac', 'AAC'],
    ['trim', 'Trim'],
    ['compress', 'Compress'],
    ['metadata', 'Metadata']
  ]),
  unknown: []
}
export function getFileExtension(filename: string): string {
  const part = filename.split('.').pop()
  return part && part !== filename ? part.toLowerCase() : ''
}
export function getFileCategory(filename: string): FileCategory {
  const ext = getFileExtension(filename)
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'gif', 'heic', 'heif'].includes(ext)) {
    return 'image'
  }
  if (ext === 'pdf') return 'document'
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac'].includes(ext)) return 'audio'
  return 'unknown'
}
export const getOperationsForFile = (filename: string): FileOperation[] =>
  operationMap[getFileCategory(filename)]

/** Image-only actions, revealed while the Command key is held. */
const imageToolOperations = entries([
  ['compress', 'Compress'],
  ['metadata', 'Metadata'],
  ['edit', 'Edit'],
  ['crop', 'Crop'],
  ['remove-background', 'Remove BG'],
  ['send-email', 'Send Email']
])

export const getFileToolOperations = (filename: string): FileOperation[] =>
  getFileCategory(filename) === 'image' ? imageToolOperations : []
export const formatFileSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`
