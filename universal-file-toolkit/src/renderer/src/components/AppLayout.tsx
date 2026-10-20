import type { PropsWithChildren } from 'react'

/** Shared application chrome, kept separate so future tool screens can reuse it. */
export default function AppLayout({ children }: PropsWithChildren): React.JSX.Element {
  return <main className="app-shell">{children}</main>
}
