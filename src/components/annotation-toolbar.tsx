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
import { IconButton } from './ui'

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

export function AnnotationToolbar() {
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
  const [isDragging, setIsDragging] = useState(false)

  const activeColor = annotationColors.find((item) => item.value === color)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(toolbarSettingsKey)
      if (!saved) return
      const parsed: unknown = JSON.parse(saved)
      if (!isToolbarSettings(parsed) || !trayRef.current) return
      const bounds = trayRef.current.getBoundingClientRect()
      const minX = -bounds.left
      const minY = -bounds.top
      const next = {
        x: Math.min(Math.max(minX, parsed.x), Math.max(minX, window.innerWidth - bounds.right)),
        y: Math.min(Math.max(minY, parsed.y), Math.max(minY, window.innerHeight - bounds.bottom)),
      }
      toolbarOffsetRef.current = next
      setToolbarOffset(next)
      if (parsed.orientation) {
        orientationRef.current = parsed.orientation
        setOrientation(parsed.orientation)
      }
    } catch {
      // Storage can be unavailable in private browsing or blocked documents.
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
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
    })
    return () => window.cancelAnimationFrame(frame)
  }, [orientation])

  const persistSettings = () => {
    try {
      window.localStorage.setItem(
        toolbarSettingsKey,
        JSON.stringify({ ...toolbarOffsetRef.current, orientation: orientationRef.current }),
      )
    } catch {
      // Storage can be unavailable in private browsing or blocked documents.
    }
  }

  const toggleOrientation = () => {
    const next = orientationRef.current === 'horizontal' ? 'vertical' : 'horizontal'
    orientationRef.current = next
    setOrientation(next)
    persistSettings()
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
    if (dragRef.current) persistSettings()
    dragRef.current = null
    setIsDragging(false)
  }

  return (
    <div className="annotation-toolbar">
      <div
        ref={trayRef}
        className={`tool-tray ${orientation === 'vertical' ? 'is-vertical' : ''} ${isDragging ? 'is-dragging' : ''}`}
        role="toolbar"
        aria-label="Annotation tools"
        style={{ '--toolbar-offset-x': `${toolbarOffset.x}px`, '--toolbar-offset-y': `${toolbarOffset.y}px` } as CSSProperties}
      >
        <button
          className="toolbar-drag-handle"
          type="button"
          aria-label="Move annotation toolbar"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => endDrag()}
        >
          <span className="toolbar-drag-dots" aria-hidden="true"><i /><i /><i /></span>
        </button>
        <button
          className="toolbar-orientation-toggle"
          type="button"
          aria-label={orientation === 'horizontal' ? 'Make toolbar vertical' : 'Make toolbar horizontal'}
          aria-pressed={orientation === 'vertical'}
          title={orientation === 'horizontal' ? 'Make toolbar vertical' : 'Make toolbar horizontal'}
          onClick={toggleOrientation}
        >
          <span className={`toolbar-orientation-glyph ${orientation === 'horizontal' ? 'is-vertical' : 'is-horizontal'}`} aria-hidden="true">
            <i /><i /><i />
          </span>
        </button>
        {tools.map(({ tool, label, shortcut, icon }, index) => (
          <span className={index === 2 || index === 5 || index === 8 ? 'tool-group-start' : ''} key={tool}>
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
            <button className="color-trigger" type="button" aria-label={`Annotation color: ${activeColor?.name ?? 'custom'}`}>
              <span className="color-swatch" style={{ background: color }} />
              <span className="color-label">{activeColor?.name ?? 'Color'}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="color-menu" align="end" sideOffset={8}>
              <span>Annotation color</span>
              <div>
                {annotationColors.map((item) => (
                  <DropdownMenu.Item
                    key={item.value}
                    className={`color-option ${color === item.value ? 'is-active' : ''}`}
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
