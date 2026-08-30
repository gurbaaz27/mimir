import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, XIcon } from '#/components/icons'
import { useEditorStore } from '#/lib/editor-store.client'
import {
  hasSeenReaderTour,
  markReaderTourSeen,
  readerTourSteps,
  type TourContext,
  type TourStep,
} from '#/lib/reader-tour'
import { cn } from '#/lib/utils'
import { Button, MimirMark } from './ui'
import { Kbd } from './ui/kbd'

type Spot = { top: number; left: number; width: number; height: number }

const keyPattern = /\[([^\]]+)]/g

/** Tour copy marks its shortcuts as `[⌘F]`; they come out as real key caps. */
function withKeys(copy: string): Array<ReactNode> {
  const parts: Array<ReactNode> = []
  let cursor = 0
  for (const match of copy.matchAll(keyPattern)) {
    if (match.index > cursor) parts.push(copy.slice(cursor, match.index))
    parts.push(<Kbd key={match.index}>{match[1]}</Kbd>)
    cursor = match.index + match[0].length
  }
  if (cursor < copy.length) parts.push(copy.slice(cursor))
  return parts
}

const cardGap = 12
const viewportMargin = 14

/** The tour waits for the first page to paint so it never points at nothing. */
const openDelay = 750
/** Long enough to read the checkmark, short enough that it never feels stuck. */
const celebrationDelay = 950

function readSpot(selector: string, padding: number): Spot | null {
  const element = document.querySelector(selector)
  if (!element) return null
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  return {
    top: bounds.top - padding,
    left: bounds.left - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}

function sameSpot(a: Spot | null, b: Spot | null) {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/**
 * Anchors the card beside the spotlight, flipping to the opposite side when the
 * preferred one would run off screen and clamping so the card is always whole.
 */
function placeCard(spot: Spot, step: TourStep, width: number, height: number) {
  const { innerWidth, innerHeight } = window
  const clamp = (value: number, size: number, limit: number) =>
    Math.max(viewportMargin, Math.min(value, limit - size - viewportMargin))
  const side = step.side ?? 'bottom'
  const align = step.align ?? 'center'
  const spotRight = spot.left + spot.width
  const spotBottom = spot.top + spot.height

  if (side === 'left' || side === 'right') {
    const wantsRight = side === 'right'
    const fits = wantsRight
      ? spotRight + cardGap + width <= innerWidth - viewportMargin
      : spot.left - cardGap - width >= viewportMargin
    const onRight = fits ? wantsRight : !wantsRight
    const top = align === 'start' ? spot.top : align === 'end' ? spotBottom - height : spot.top + spot.height / 2 - height / 2
    return {
      left: clamp(onRight ? spotRight + cardGap : spot.left - cardGap - width, width, innerWidth),
      top: clamp(top, height, innerHeight),
    }
  }

  const wantsBelow = side !== 'top'
  const fits = wantsBelow
    ? spotBottom + cardGap + height <= innerHeight - viewportMargin
    : spot.top - cardGap - height >= viewportMargin
  const below = fits ? wantsBelow : !wantsBelow
  const left = align === 'start' ? spot.left : align === 'end' ? spotRight - width : spot.left + spot.width / 2 - width / 2
  return {
    left: clamp(left, width, innerWidth),
    top: clamp(below ? spotBottom + cardGap : spot.top - cardGap - height, height, innerHeight),
  }
}

/**
 * A once-per-browser walk around the reader, shown the first time someone opens
 * a document. Steps that can be *done* rather than read — picking a tool,
 * opening the navigator, opening chat — advance themselves when the reader
 * actually does the thing, so nothing here blocks the page underneath.
 */
export function ReaderTour({ ready, chatOpen }: { ready: boolean; chatOpen: boolean }) {
  const tool = useEditorStore((state) => state.tool)
  const sidebarOpen = useEditorStore((state) => state.sidebarOpen)
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null)
  const [armed, setArmed] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const step = readerTourSteps[index]
  const context: TourContext = { tool, sidebarOpen, chatOpen }
  const selector = active && step?.target ? step.target(context) : null
  const satisfied = Boolean(active && step?.done?.(context))
  const hint = step?.hint?.(context) ?? null

  useEffect(() => {
    if (!ready || hasSeenReaderTour()) return
    const timer = window.setTimeout(() => setActive(true), openDelay)
    return () => window.clearTimeout(timer)
  }, [ready])

  // Targets move under the tour: the tray is draggable, and the navigator and
  // chat panels slide over 280ms. Tracking by frame keeps the spotlight welded
  // to them without a listener per animation.
  useEffect(() => {
    if (!selector) {
      setSpot(null)
      return
    }
    const padding = step?.padding ?? 6
    let frame = 0
    const track = () => {
      const next = readSpot(selector, padding)
      setSpot((previous) => (sameSpot(previous, next) ? previous : next))
      frame = window.requestAnimationFrame(track)
    }
    frame = window.requestAnimationFrame(track)
    return () => window.cancelAnimationFrame(frame)
  }, [selector, step?.padding])

  // No dependency list on purpose: the card is re-placed from its own measured
  // size whenever anything moves, and bails out when the result is unchanged.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !spot) {
      setPlacement((previous) => (previous === null ? previous : null))
      return
    }
    const bounds = card.getBoundingClientRect()
    const next = placeCard(spot, step, bounds.width, bounds.height)
    setPlacement((previous) => (previous && previous.top === next.top && previous.left === next.left ? previous : next))
  })

  // A step only celebrates a change the reader makes *during* it. Arriving at
  // the toolbar step with a tool already chosen just shows Next.
  useEffect(() => {
    if (!active) return
    setArmed(!satisfied)
    setCelebrating(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `satisfied` is read once, on entry
  }, [active, index])

  useEffect(() => {
    if (!active || !armed || !satisfied) return
    setCelebrating(true)
    const timer = window.setTimeout(() => {
      setCelebrating(false)
      setIndex((current) => Math.min(current + 1, readerTourSteps.length - 1))
    }, celebrationDelay)
    return () => window.clearTimeout(timer)
  }, [active, armed, satisfied])

  useEffect(() => {
    if (!active) return
    const end = () => {
      markReaderTourSeen()
      setActive(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      end()
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [active])

  if (!active || !step) return null

  const last = index === readerTourSteps.length - 1
  const finish = () => {
    markReaderTourSeen()
    setActive(false)
  }
  const next = () => (last ? finish() : setIndex(index + 1))

  return (
    <div data-tour-overlay className="pointer-events-none">
      {spot ? (
        <>
          <div
            aria-hidden="true"
            className="fixed z-85 transition-[top,left,width,height] duration-280 ease-spring"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              borderRadius: step.radius ?? 14,
              boxShadow: 'inset 0 0 0 1.5px oklch(1 0 0 / .5), 0 0 0 2px var(--color-ink), 0 0 0 9999px oklch(.22 .01 60 / .38)',
            }}
          />
          {hint && !celebrating && (
            <div
              aria-hidden="true"
              className="fixed z-86 animate-tour-pulse transition-[top,left,width,height] duration-280 ease-spring"
              style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: step.radius ?? 14 }}
            />
          )}
        </>
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-85 animate-fade-in bg-[oklch(.22_.01_60/.38)]" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className={cn(
          'pointer-events-auto fixed z-90 w-[min(322px,calc(100vw-28px))] rounded-[17px] border border-line bg-paper p-[17px] shadow-[0_0_0_1px_oklch(.2_.005_60/.05),0_18px_44px_oklch(.18_.006_60/.2),0_3px_8px_oklch(.18_.006_60/.09)]',
          spot ? 'transition-[top,left] duration-280 ease-spring' : 'top-1/2 left-1/2 [transform:translate(-50%,-50%)] animate-dialog-in',
        )}
        style={spot ? { top: placement?.top ?? 0, left: placement?.left ?? 0, visibility: placement ? 'visible' : 'hidden' } : undefined}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-[5px]" aria-hidden="true">
            {readerTourSteps.map((item, position) => (
              <span
                key={item.id}
                className={cn(
                  'block size-[5px] rounded-full transition-[width,background-color] duration-240 ease-spring',
                  position === index ? 'w-3.5 bg-ink' : position < index ? 'bg-clay' : 'bg-line-strong',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            className="-mr-1.5 inline-flex items-center gap-1 rounded-lg border-0 bg-transparent px-1.5 py-1 text-[11px] text-faint transition-colors duration-150 hover:bg-sunken hover:text-ink-soft"
            onClick={finish}
          >
            Skip <XIcon size={12} />
          </button>
        </div>

        <div key={step.id} className="animate-message-in" aria-live="polite">
          <div className="flex items-center gap-2">
            {index === 0 && <MimirMark compact />}
            <strong id="tour-title" className="font-display text-[16.5px] leading-tight font-[620] tracking-[-.028em] text-ink">
              {step.title}
            </strong>
          </div>
          <p className="mt-[7px] mb-0 text-[12px] leading-[1.65] text-pretty text-muted">{withKeys(step.body)}</p>
        </div>

        {(hint || celebrating) && (
          <div
            className={cn(
              'mt-3 inline-flex items-center gap-[7px] rounded-full px-[11px] py-[5px] text-[11px] font-[520] transition-colors duration-200',
              celebrating ? 'bg-[oklch(.95_.03_155)] text-moss' : 'bg-cream text-bark',
            )}
          >
            {celebrating ? (
              <>
                <CheckIcon size={13} /> Nice — that’s it.
              </>
            ) : (
              <>
                <span className="size-1.5 shrink-0 animate-ping-soft rounded-full bg-clay" /> {hint && withKeys(hint)}
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[10.5px] text-faint tabular-nums">
            {index + 1} of {readerTourSteps.length}
          </span>
          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <Button tone="paper" size="compact" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button size="compact" onClick={next}>
              {last ? 'Start reading' : index === 0 ? 'Show me' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
