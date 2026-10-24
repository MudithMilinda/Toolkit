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
    ['flac', 'FLAC'],
    ['ogg', 'OGG'],
    ['opus', 'OPUS'],
    ['aiff', 'AIFF']
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
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'opus', 'aif', 'aiff'].includes(ext)) return 'audio'
  return 'unknown'
}
export const getOperationsForFile = (filename: string): FileOperation[] =>
  operationMap[getFileCategory(filename)]

/** Actions revealed while Q is held during a file drag. */
const imageToolOperations = entries([
  ['compress', 'Compress'],
  ['zip', 'ZIP'],
  ['metadata', 'Metadata'],
  ['edit', 'Edit'],
  ['crop', 'Crop'],
  ['remove-background', 'Remove BG'],
  ['send-email', 'Send Email']
])

// Keep these IDs distinct from image operations. Several labels overlap (Crop,
// Compress and Metadata), but the implementations and controls are different
// for video files.
const videoToolOperations = entries([
  ['video-compress', 'Compress'],
  ['zip', 'ZIP'],
  ['video-metadata', 'Metadata'],
  ['video-mute', 'Mute'],
  ['video-trim', 'Trim'],
  ['video-crop', 'Crop'],
  ['video-speed', 'Speed'],
  ['send-email', 'Send Email']
])
const audioToolOperations = entries([
  ['audio-compress', 'Compress'],
  ['zip', 'ZIP'],
  ['audio-metadata', 'Metadata'],
  ['audio-normalize', 'Normalize'],
  ['audio-trim', 'Trim'],
  ['audio-bleep', 'Bleep']
])

export const getFileToolOperations = (filename: string): FileOperation[] =>
  getFileCategory(filename) === 'image'
    ? imageToolOperations
    : getFileCategory(filename) === 'video'
      ? videoToolOperations
      : getFileCategory(filename) === 'audio'
        ? audioToolOperations
        : []
export const formatFileSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`
