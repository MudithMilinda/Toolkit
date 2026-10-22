export default function OperationTooltip({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="absolute bottom-3 rounded-full bg-[#071421]/82 px-3 py-1 text-[10px] text-cyan-100 backdrop-blur" aria-live="polite">
      {label}
    </div>
  )
}
