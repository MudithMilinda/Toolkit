export default function OperationTooltip({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="radial-tooltip" aria-live="polite">
      {label}
    </div>
  )
}
