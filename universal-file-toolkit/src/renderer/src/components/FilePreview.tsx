import { FileText } from 'lucide-react'
import type { FileOperation } from '../utils/fileFormats'
import { formatFileSize, getFileExtension } from '../utils/fileFormats'
export default function FilePreview({
  file,
  operation
}: {
  file: File
  operation: FileOperation | null
}): React.JSX.Element {
  return (
    <aside className="file-preview glass-panel">
      <div className="file-icon">
        <FileText size={18} />
      </div>
      <div className="file-details">
        <span className="file-name" title={file.name}>
          {file.name}
        </span>
        <span>
          {getFileExtension(file.name).toUpperCase() || 'FILE'} · {formatFileSize(file.size)}
        </span>
      </div>
      <div className="selection-copy">{operation ? operation.label : 'Choose an operation'}</div>
    </aside>
  )
}
