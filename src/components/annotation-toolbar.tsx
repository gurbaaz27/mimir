import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { DropdownMenu } from 'radix-ui'
import {
  ArrowUpRightIcon,
  EllipseIcon,
  HandIcon,
  HighlighterIcon,
  NoteIcon,
  PencilIcon,
  PointerIcon,
  RectangleIcon,
  StrikethroughIcon,
  TextBoxIcon,
  UnderlineIcon,
  type AnimatedIcon,
} from '#/components/icons'
import { annotationColors } from '#/lib/annotations'
import { useEditorStore, type EditorTool } from '#/lib/editor-store.client'
import { cn } from '#/lib/utils'
import { IconButton, menuContentClass } from './ui'

const tools: Array<{ tool: EditorTool; label: string; shortcut: string; icon: AnimatedIcon }> = [
  { tool: 'select', label: 'Select', shortcut: 'Esc', icon: PointerIcon },
  { tool: 'pan', label: 'Pan', shortcut: 'Space', icon: HandIcon },
  { tool: 'highlight', label: 'Highlight', shortcut: 'H', icon: HighlighterIcon },
  { tool: 'underline', label: 'Underline', shortcut: 'U', icon: UnderlineIcon },
  { tool: 'strikeout', label: 'Strike Out', shortcut: '⇧S', icon: StrikethroughIcon },
  { tool: 'ink', label: 'Draw', shortcut: 'D', icon: PencilIcon },
  { tool: 'text', label: 'Text Box', shortcut: 'T', icon: TextBoxIcon },
  { tool: 'note', label: 'Note', shortcut: 'N', icon: NoteIcon },
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: RectangleIcon },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: EllipseIcon },
  { tool: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowUpRightIcon },
]

const toolbarSettingsKey = 'mimir:annotation-toolbar-position'

type ToolbarOffset = { x: number; y: number }
type ToolbarOrientation = 'horizontal' | 'vertical'
type AnnotationToolbarProps = { sidebarOpen?: boolean; chatOpen?: boolean }

function isToolbarSettings(value: unknown): value is ToolbarOffset & { orientation?: ToolbarOrientation } {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<ToolbarOffset> & { orientation?: unknown }
  return (
    typeof settings.x === 'number' &&
    Number.isFinite(settings.x) &&
    typeof settings.y === 'number' &&
    Number.isFinite(settings.y) &&
    (settings.orientation === undefined || settings.orientation === 'horizontal' || settings.orientation === 'vertical')
  )
}

function persistToolbarSettings(offset: ToolbarOffset, orientation: ToolbarOrientation) {
  try {
    window.localStorage.setItem(toolbarSettingsKey, JSON.stringify({ ...offset, orientation }))
  } catch {
    // Storage can be unavailable in private browsing or blocked documents.
  }
}

export function AnnotationToolbar({ sidebarOpen = false, chatOpen = false }: AnnotationToolbarProps) {
  const activeTool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)
  const color = useEditorStore((state) => state.color)
  const setColor = useEditorStore((state) => state.setColor)
  const trayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
    baseLeft: number
    baseTop: number
    width: number
    height: number
  } | null>(null)
  const [toolbarOffset, setToolbarOffset] = useState<ToolbarOffset>({ x: 0, y: 0 })
  const toolbarOffsetRef = useRef<ToolbarOffset>({ x: 0, y: 0 })
  const [orientation, setOrientation] = useState<ToolbarOrientation>('horizontal')
  const orientationRef = useRef<ToolbarOrientation>('horizontal')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const activeColor = annotationColors.find((item) => item.value === color)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(toolbarSettingsKey)
      if (!saved) return
      const parsed: unknown = JSON.parse(saved)
      if (!isToolbarSettings(parsed)) return

      // Apply the saved offset before clamping it. The tray's dimensions depend
      // on its orientation, so measuring the default horizontal tray here would
      // clamp a saved vertical position against the wrong width and height.
      const next = { x: parsed.x, y: parsed.y }
      toolbarOffsetRef.current = next
      setToolbarOffset(next)
      if (parsed.orientation) {
        orientationRef.current = parsed.orientation
        setOrientation(parsed.orientation)
      }
    } catch {
      // Storage can be unavailable in private browsing or blocked documents.
    } finally {
      setSettingsLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    const clampToolbar = () => {
      const tray = trayRef.current
      if (!tray) return
      const offset = toolbarOffsetRef.current
      const bounds = tray.getBoundingClientRect()
      const baseLeft = bounds.left - offset.x
      const baseTop = bounds.top - offset.y
      const minX = -baseLeft
      const minY = -baseTop
      const next = {
        x: Math.min(Math.max(minX, offset.x), Math.max(minX, window.innerWidth - baseLeft - bounds.width)),
        y: Math.min(Math.max(minY, offset.y), Math.max(minY, window.innerHeight - baseTop - bounds.height)),
      }
      if (next.x === offset.x && next.y === offset.y) return
      toolbarOffsetRef.current = next
      setToolbarOffset(next)
      persistToolbarSettings(next, orientationRef.current)
    }

    let frame = window.requestAnimationFrame(clampToolbar)
    const handleResize = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(clampToolbar)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [orientation, settingsLoaded])

  const toggleOrientation = () => {
    const next = orientationRef.current === 'horizontal' ? 'vertical' : 'horizontal'
    orientationRef.current = next
    setOrientation(next)
    persistToolbarSettings(toolbarOffsetRef.current, next)
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const tray = trayRef.current
    if (!tray) return
    const bounds = tray.getBoundingClientRect()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: toolbarOffsetRef.current.x,
      startOffsetY: toolbarOffsetRef.current.y,
      baseLeft: bounds.left - toolbarOffsetRef.current.x,
      baseTop: bounds.top - toolbarOffsetRef.current.y,
      width: bounds.width,
      height: bounds.height,
    }
    setIsDragging(true)
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const minX = -drag.baseLeft
    const minY = -drag.baseTop
    const maxX = Math.max(minX, window.innerWidth - drag.baseLeft - drag.width)
    const maxY = Math.max(minY, window.innerHeight - drag.baseTop - drag.height)
    const next = {
      x: Math.min(maxX, Math.max(minX, drag.startOffsetX + event.clientX - drag.startX)),
      y: Math.min(maxY, Math.max(minY, drag.startOffsetY + event.clientY - drag.startY)),
    }
    toolbarOffsetRef.current = next
    setToolbarOffset(next)
  }

  const endDrag = (event?: PointerEvent<HTMLButtonElement>) => {
    if (event && dragRef.current?.pointerId !== event.pointerId) return
    if (dragRef.current) persistToolbarSettings(toolbarOffsetRef.current, orientationRef.current)
    dragRef.current = null
    setIsDragging(false)
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-[54px] right-0 left-0 z-40 flex min-h-[66px] translate-x-[calc(var(--toolbar-sidebar-shift)-var(--toolbar-chat-shift))] items-center justify-center px-3 [--toolbar-chat-shift:0px] [--toolbar-sidebar-shift:0px] transition-transform duration-280 ease-spring max-[820px]:justify-start max-[820px]:overflow-visible max-[820px]:px-2',
        sidebarOpen && '[--toolbar-sidebar-shift:228px] max-[1100px]:[--toolbar-sidebar-shift:196px] max-[820px]:[--toolbar-sidebar-shift:0px]',
        chatOpen && '[--toolbar-chat-shift:352px] max-[1100px]:[--toolbar-chat-shift:312px] max-[820px]:hidden',
      )}
      data-sidebar-open={sidebarOpen || undefined}
      data-chat-open={chatOpen || undefined}
    >
      <div
        ref={trayRef}
        data-slot="annotation-toolbar"
        data-tour="toolbar"
        data-orientation={orientation}
        className={cn(
          'pointer-events-auto flex translate-x-(--toolbar-offset-x) translate-y-(--toolbar-offset-y) items-center gap-0.5 rounded-[14px] bg-paper px-[5px] py-1 shadow-[inset_0_0_0_1px_oklch(.2_.005_60/.06),inset_0_1px_0_var(--color-paper),0_1px_2px_oklch(.25_.02_70/.1),0_6px_16px_oklch(.28_.03_70/.12)]',
          'max-[1100px]:[&_[data-slot=icon-button]]:w-8 max-[820px]:shrink-0 max-[820px]:[&_[data-slot=icon-button]:not([aria-pressed=true])]:bg-paper max-[820px]:[&_[data-slot=icon-button]:not([aria-pressed=true])]:hover:bg-surface',
          orientation === 'vertical'
            ? 'flex-col items-stretch'
            : 'max-[820px]:max-w-[calc(100vw-16px)] max-[820px]:overflow-x-auto max-[820px]:[scrollbar-width:none] max-[820px]:[&::-webkit-scrollbar]:hidden',
          isDragging && 'cursor-grabbing select-none',
        )}
        role="toolbar"
        aria-label="Annotation tools"
        style={{ '--toolbar-offset-x': `${toolbarOffset.x}px`, '--toolbar-offset-y': `${toolbarOffset.y}px` } as CSSProperties}
      >
        <button
          className={cn(
            'grid h-[30px] w-[22px] shrink-0 touch-none place-items-center rounded-[7px] border-0 border-r border-line bg-transparent p-0 text-faint transition-[background,color] duration-150 hover:bg-surface hover:text-ink-soft active:cursor-grabbing',
            orientation === 'vertical' ? 'mb-0.5 h-[22px] w-[30px] border-r-0 border-b' : 'mr-0.5',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
          type="button"
          aria-label="Move annotation toolbar"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => endDrag()}
        >
          <span className={cn('grid gap-[3px] [&_i]:block [&_i]:size-[3px] [&_i]:rounded-full [&_i]:bg-current', orientation === 'vertical' && 'flex')} aria-hidden="true"><i /><i /><i /></span>
        </button>
        <button
          className={cn('grid h-[30px] w-[26px] shrink-0 place-items-center rounded-[7px] border-0 bg-transparent p-0 text-faint transition-[background,color,transform] duration-150 ease-spring hover:bg-surface hover:text-ink-soft active:scale-[.92]', orientation === 'vertical' && 'h-[26px] w-[30px]')}
          type="button"
          aria-label={orientation === 'horizontal' ? 'Make toolbar vertical' : 'Make toolbar horizontal'}
          aria-pressed={orientation === 'vertical'}
          title={orientation === 'horizontal' ? 'Make toolbar vertical' : 'Make toolbar horizontal'}
          onClick={toggleOrientation}
        >
          <span className={cn(
            'flex size-[13px] items-center justify-center gap-0.5 [&_i]:block [&_i]:rounded-full [&_i]:bg-current',
            orientation === 'horizontal' ? '[&_i]:h-[13px] [&_i]:w-0.5' : 'flex-col [&_i]:h-0.5 [&_i]:w-[13px]',
          )} aria-hidden="true">
            <i /><i /><i />
          </span>
        </button>
        {tools.map(({ tool, label, shortcut, icon }, index) => (
          <span className={cn(
            'inline-flex',
            (index === 2 || index === 5 || index === 8) && (orientation === 'vertical' ? 'mt-[9px] border-t border-line pt-[9px]' : 'ml-[9px] border-l border-line pl-[9px]'),
          )} key={tool}>
            <IconButton
              label={label}
              shortcut={shortcut}
              icon={icon}
              active={activeTool === tool}
              onClick={() => setTool(tool)}
            />
          </span>
        ))}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className={cn(
              'ml-[9px] inline-flex h-[30px] items-center gap-[7px] rounded-[9px] border-0 bg-sunken pr-[11px] pl-2 text-[11px] font-[520] tracking-[-.005em] text-ink-soft transition-[background,color,transform] duration-150 ease-spring hover:bg-[oklch(.94_.007_85)] hover:text-ink active:scale-[.94] max-[820px]:bg-paper',
              orientation === 'vertical' && 'mt-[9px] ml-0 w-[30px] justify-center p-0',
            )} type="button" aria-label={`Annotation color: ${activeColor?.name ?? 'custom'}`}>
              <span className="size-3.5 shrink-0 rounded-full border-2 border-paper shadow-[0_0_0_1px_var(--color-line-strong)]" style={{ background: color }} />
              <span className={cn(orientation === 'vertical' && 'hidden')}>{activeColor?.name ?? 'Color'}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={cn(menuContentClass, 'min-w-[190px] p-[11px]')} align="end" sideOffset={8}>
              <span className="mb-[9px] block text-[10.5px] text-muted">Annotation color</span>
              <div className="flex gap-[9px]">
                {annotationColors.map((item) => (
                  <DropdownMenu.Item
                    key={item.value}
                    className={cn(
                      'relative size-6 rounded-full border-2 border-paper bg-(--swatch) p-0 shadow-[0_0_0_1px_var(--color-line-strong)] outline-none transition-transform duration-140 ease-spring hover:scale-112 data-[highlighted]:scale-112',
                      color === item.value && `after:absolute after:-inset-1 after:rounded-full after:border-[1.5px] after:border-ink after:content-['']`,
                    )}
                    aria-label={item.name}
                    onSelect={() => setColor(item.value)}
                    style={{ '--swatch': item.value } as React.CSSProperties}
                  />
                ))}
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}
