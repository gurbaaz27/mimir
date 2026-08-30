import type { CSSProperties, PointerEvent } from 'react'
import { pointForResizeHandle, resizeHandles, type ResizeHandle } from '#/lib/annotation-geometry'
import type { NormalizedRect, Point } from '#/lib/annotations'

interface ResizeHandlesProps {
  bounds: NormalizedRect
  coordinateSpace?: 'page' | 'parent'
  zoom?: number
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

export function ResizeHandles({
  bounds,
  coordinateSpace = 'parent',
  zoom = 1,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ResizeHandlesProps) {
  return (
    <div
      className={`annotation-resize-handles is-${coordinateSpace}`}
      style={{ '--annotation-handle-zoom': zoom } as CSSProperties}
      aria-label="Resize annotation"
    >
      {resizeHandles.map((handle) => {
        const point = coordinateSpace === 'page' ? pointForResizeHandle(bounds, handle) : parentPositions[handle]
        return (
          <button
            key={handle}
            type="button"
            className={`annotation-resize-handle is-${handle}`}
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
    <div className="annotation-endpoint-handles" aria-label="Adjust line endpoints">
      {(['start', 'end'] as const).map((endpoint) => {
        const point = endpoint === 'start' ? start : end
        return (
          <button
            key={endpoint}
            type="button"
            className={`annotation-endpoint-handle is-${endpoint}`}
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
