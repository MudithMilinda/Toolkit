import { Aperture, Settings2 } from 'lucide-react'
export default function AppHeader({
  onOpenSettings
}: {
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <header className="absolute left-5 right-5 top-4 flex items-center justify-between text-xs text-white">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-cyan-400/12 text-cyan-200">
          <Aperture size={18} />
        </span>
        <span>
          Universal <b>File Toolkit</b>
        </span>
      </div>
      <button className="grid size-8 place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818] hover:bg-white" aria-label="Open settings" onClick={onOpenSettings}>
        <Settings2 size={19} />
      </button>
    </header>
  )
}
