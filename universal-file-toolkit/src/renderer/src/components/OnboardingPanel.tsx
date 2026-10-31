import { ArrowRight, FileOutput, Hand, LockKeyhole, Sparkles } from 'lucide-react'
import { useState } from 'react'
import dropletLogo from '../assets/droplet-logo.png'

interface Props {
  onComplete: () => void
}

const steps = [
  {
    icon: Sparkles,
    title: 'Welcome to Droplet',
    text: 'A fast, local way to convert and edit files without uploading them anywhere.'
  },
  {
    icon: Hand,
    title: 'Drag, then hold Shift',
    text: 'Drag a file and hold Shift to choose a conversion format from the radial menu.'
  },
  {
    icon: FileOutput,
    title: 'Quick tools are one gesture away',
    text: 'Drag supported media files and hold Q for tools such as compress, trim, crop, and metadata.'
  },
  {
    icon: LockKeyhole,
    title: 'Your files stay on this Mac',
    text: 'Conversions run locally. Output files are saved next to the original file.'
  }
]

export default function OnboardingPanel({ onComplete }: Props): React.JSX.Element {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const Icon = current.icon
  const finalStep = step === steps.length - 1

  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-8 text-white">
      <section className="flex h-[330px] w-full max-w-[350px] flex-col rounded-[24px] border border-white/12 bg-gradient-to-b from-[#29292c] to-[#171719] p-6 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.14em] text-white/70">
            <img className="size-4 rounded" src={dropletLogo} alt="Droplet" /> DROPLET
          </span>
          <span className="text-[10px] text-white/45">
            {step + 1} / {steps.length}
          </span>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="mb-4 grid size-12 place-items-center overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-white/20">
            {step === 0 ? (
              <img className="size-full object-cover" src={dropletLogo} alt="Droplet logo" />
            ) : (
              <Icon size={21} strokeWidth={1.8} />
            )}
          </div>
          <h1 className="m-0 text-[21px] font-semibold tracking-[-0.04em]">{current.title}</h1>
          <p className="mt-2 text-[12px] leading-5 text-white/65">{current.text}</p>
          {step === 0 && (
            <p className="mt-3 text-[10px] font-medium tracking-[0.08em] text-white/40">
              CREATED BY MUDITH MILINDA
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5">
            {steps.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all ${index === step ? 'w-6 bg-white' : 'w-1.5 bg-white/25'}`}
              />
            ))}
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-zinc-950 outline-none transition hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            type="button"
            onClick={() => (finalStep ? onComplete() : setStep((value) => value + 1))}
          >
            {finalStep ? 'Get Started' : 'Next'} <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  )
}
