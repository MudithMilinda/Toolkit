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
    ['jpg', 'JPG'],
    ['webp', 'WEBP'],
    ['resize', 'Resize'],
    ['compress', 'Compress'],
    ['crop', 'Crop']
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
    ['webm', 'WEBM'],
    ['audio', 'Extract audio'],
    ['trim', 'Trim'],
    ['compress', 'Compress'],
    ['metadata', 'Metadata']
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
export const formatFileSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`
