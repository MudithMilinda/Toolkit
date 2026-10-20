import { Aperture, Settings2 } from 'lucide-react'
export default function AppHeader({
  onOpenSettings
}: {
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-icon">
          <Aperture size={18} />
        </span>
        <span>
          Universal <b>File Toolkit</b>
        </span>
      </div>
      <button className="icon-button" aria-label="Open settings" onClick={onOpenSettings}>
        <Settings2 size={19} />
      </button>
    </header>
  )
}
