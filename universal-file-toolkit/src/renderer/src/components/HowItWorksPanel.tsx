import { Check, FileOutput, Hand, LockKeyhole, Wrench } from 'lucide-react'
import dropletLogo from '../assets/droplet-logo.png'

interface Props {
  onClose: () => void
}

const instructions = [
  {
    icon: Hand,
    title: 'Convert files',
    text: 'Drag a file, then hold Shift to choose an output format.'
  },
  {
    icon: Wrench,
    title: 'Use quick tools',
    text: 'Drag supported media files and hold Q for editing tools.'
  },
  {
    icon: FileOutput,
    title: 'Find your output',
    text: 'Converted files are saved next to the original file.'
  },
  {
    icon: LockKeyhole,
    title: 'Stay private',
    text: 'Your files remain on your Mac during conversion.'
  }
]

export default function HowItWorksPanel({ onClose }: Props): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-8 text-white">
      <section className="w-full max-w-[390px] rounded-[24px] border border-white/12 bg-gradient-to-b from-[#29292c] to-[#171719] p-6 shadow-2xl">
        <header className="mb-5 flex items-center gap-2">
          <img className="size-5 rounded" src={dropletLogo} alt="Droplet" />
          <span className="text-[10px] font-semibold tracking-[0.14em] text-white/70">DROPLET</span>
        </header>
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.04em]">How Droplet works</h1>
        <div className="mt-5 space-y-4">
          {instructions.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80">
                <Icon size={16} strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="m-0 text-[12px] font-semibold">{title}</h2>
                <p className="m-0 mt-0.5 text-[11px] leading-4 text-white/55">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-zinc-950 outline-none transition hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          type="button"
          onClick={onClose}
        >
          <Check size={14} /> Done
        </button>
      </section>
    </div>
  )
}
