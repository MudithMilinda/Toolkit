export interface Point {
  x: number
  y: number
}
export const polarToCartesian = (cx: number, cy: number, radius: number, angle: number): Point => ({
  x: cx + radius * Math.cos(((angle - 90) * Math.PI) / 180),
  y: cy + radius * Math.sin(((angle - 90) * Math.PI) / 180)
})
export function arcPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number
): string {
  const a = polarToCartesian(cx, cy, outer, end)
  const b = polarToCartesian(cx, cy, outer, start)
  const c = polarToCartesian(cx, cy, inner, start)
  const d = polarToCartesian(cx, cy, inner, end)
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 0 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 1 ${d.x} ${d.y} Z`
}
