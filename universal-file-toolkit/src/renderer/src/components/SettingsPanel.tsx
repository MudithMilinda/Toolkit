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
          data-panel
          className="absolute right-5 top-5 w-72 rounded-2xl border border-sky-200/22 bg-[#181818] p-4 text-[#f5f5f5] shadow-[0_22px_55px_rgba(0,0,0,.46)]"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
        >
          <button
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
          <span className="text-[10px] tracking-[.16em] text-white/64">SETTINGS</span>
          <h2 className="mb-2 mt-1 text-base">Prototype preferences</h2>
          <p className="text-xs text-white/64">
            All files stay on this device. Conversion tools are visual prototypes in this phase.
          </p>
          <div className="mt-4 flex justify-between border-t border-sky-200/16 pt-3 text-xs">
            <span>System-wide file drop</span>
            <em className="text-white/64">Planned</em>
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <span>Conversion engine</span>
            <em className="text-white/64">Not connected</em>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
