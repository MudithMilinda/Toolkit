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
          className="status-toast"
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
