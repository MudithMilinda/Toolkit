import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
export default function SettingsPanel({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}): React.JSX.Element {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          className="settings-panel glass-panel"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
        >
          <button
            className="icon-button settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
          <span className="eyebrow">SETTINGS</span>
          <h2>Prototype preferences</h2>
          <p>
            All files stay on this device. Conversion tools are visual prototypes in this phase.
          </p>
          <div className="setting-row">
            <span>System-wide file drop</span>
            <em>Planned</em>
          </div>
          <div className="setting-row">
            <span>Conversion engine</span>
            <em>Not connected</em>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
