import type { CSSProperties, PointerEvent } from 'react'
import { pointForResizeHandle, resizeHandles, type ResizeHandle } from '#/lib/annotation-geometry'
import type { NormalizedRect, Point } from '#/lib/annotations'
import { cn } from '#/lib/utils'

interface ResizeHandlesProps {
  bounds: NormalizedRect
  coordinateSpace?: 'page' | 'parent'
  zoom?: number
  hideVisuals?: boolean
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
}

const parentPositions: Record<ResizeHandle, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
}

const handleClass = `absolute grid size-[22px] -translate-x-1/2 -translate-y-1/2 touch-none place-items-center border-0 bg-transparent p-0 outline-none pointer-events-auto after:size-2 after:rounded-sm after:border-[1.5px] after:border-ink after:bg-paper after:shadow-[0_1px_2px_oklch(.2_.02_70/.24)] after:transition-[width,height,border-color,background] after:duration-100 after:content-[''] hover:after:size-2.5 hover:after:border-mark-tide hover:after:bg-[color-mix(in_oklab,var(--color-mark-tide)_12%,var(--color-paper))] focus-visible:after:size-2.5 focus-visible:after:border-mark-tide focus-visible:after:bg-[color-mix(in_oklab,var(--color-mark-tide)_12%,var(--color-paper))]`

const resizeCursor: Record<ResizeHandle, string> = {
  nw: 'cursor-nwse-resize', n: 'cursor-ns-resize', ne: 'cursor-nesw-resize',
  e: 'cursor-ew-resize', se: 'cursor-nwse-resize', s: 'cursor-ns-resize',
  sw: 'cursor-nesw-resize', w: 'cursor-ew-resize',
}

export function ResizeHandles({
  bounds,
  coordinateSpace = 'parent',
  zoom = 1,
  hideVisuals = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ResizeHandlesProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-4"
      style={{ '--annotation-handle-zoom': zoom } as CSSProperties}
      aria-label="Resize annotation"
    >
      {resizeHandles.map((handle) => {
        const point = coordinateSpace === 'page' ? pointForResizeHandle(bounds, handle) : parentPositions[handle]
        return (
          <button
            key={handle}
            type="button"
            className={cn(
              handleClass,
              resizeCursor[handle],
              hideVisuals && 'after:opacity-0',
              coordinateSpace === 'parent' && 'scale-[calc(1/var(--annotation-handle-zoom,1))]',
            )}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            aria-label={`Resize from ${handle}`}
            data-resize-handle={handle}
            onPointerDown={(event) => onPointerDown(event, handle)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )
      })}
    </div>
  )
}

interface EndpointHandlesProps {
  start: Point
  end: Point
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, endpoint: 'start' | 'end') => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
}

export function EndpointHandles({ start, end, onPointerDown, onPointerMove, onPointerUp }: EndpointHandlesProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-4" aria-label="Adjust line endpoints">
      {(['start', 'end'] as const).map((endpoint) => {
        const point = endpoint === 'start' ? start : end
        return (
          <button
            key={endpoint}
            type="button"
            className={cn(
              handleClass,
              'cursor-move after:size-[9px] after:rounded-full',
              endpoint === 'end' && 'after:bg-ink after:shadow-[inset_0_0_0_2px_var(--color-paper),0_1px_2px_oklch(.2_.02_70/.24)]',
            )}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            aria-label={`Move ${endpoint} point`}
            data-endpoint={endpoint}
            onPointerDown={(event) => onPointerDown(event, endpoint)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )
      })}
    </div>
  )
}
