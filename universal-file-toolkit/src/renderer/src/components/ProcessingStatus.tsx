import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2 } from 'lucide-react'
export default function ProcessingStatus({
  message
}: {
  message: string | null
}): React.JSX.Element {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="absolute top-5 z-10 flex items-center gap-2 rounded-full border border-cyan-300/25 bg-[#071421]/82 px-3 py-2 text-xs text-cyan-100 shadow-lg backdrop-blur"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <CheckCircle2 size={17} />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
