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
    <aside className="absolute left-5 top-5 flex items-center gap-3 rounded-2xl border border-sky-200/22 bg-[#181818] p-3 text-[#f5f5f5] shadow-[0_12px_32px_rgba(0,0,0,.3)]">
      <div className="grid size-9 place-items-center rounded-xl bg-cyan-400/12 text-cyan-200">
        <FileText size={18} />
      </div>
      <div className="grid min-w-0 text-[10px] text-white/64">
        <span className="max-w-36 overflow-hidden text-xs font-semibold text-white text-ellipsis whitespace-nowrap" title={file.name}>
          {file.name}
        </span>
        <span>
          {getFileExtension(file.name).toUpperCase() || 'FILE'} · {formatFileSize(file.size)}
        </span>
      </div>
      <div className="rounded-full bg-[#252525] px-2 py-1 text-[9px] text-white/64">{operation ? operation.label : 'Choose an operation'}</div>
    </aside>
  )
}
