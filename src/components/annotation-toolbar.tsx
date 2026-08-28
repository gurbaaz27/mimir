import {
  ArrowUpRight,
  Circle,
  Highlighter,
  MousePointer2,
  Move,
  Pencil,
  RectangleHorizontal,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Underline,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { annotationColors } from '#/lib/annotations'
import { useEditorStore, type EditorTool } from '#/lib/editor-store.client'
import { IconButton } from './ui'

const tools: Array<{ tool: EditorTool; label: string; shortcut: string; icon: typeof MousePointer2 }> = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { tool: 'pan', label: 'Pan', shortcut: 'Space', icon: Move },
  { tool: 'highlight', label: 'Highlight', shortcut: 'H', icon: Highlighter },
  { tool: 'underline', label: 'Underline', shortcut: 'U', icon: Underline },
  { tool: 'strikeout', label: 'Strike out', shortcut: '⇧S', icon: Strikethrough },
  { tool: 'ink', label: 'Draw', shortcut: 'D', icon: Pencil },
  { tool: 'text', label: 'Text box', shortcut: 'T', icon: TextCursorInput },
  { tool: 'note', label: 'Note', shortcut: 'N', icon: StickyNote },
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: RectangleHorizontal },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: Circle },
  { tool: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowUpRight },
]

export function AnnotationToolbar() {
  const activeTool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)
  const color = useEditorStore((state) => state.color)
  const setColor = useEditorStore((state) => state.setColor)

  return (
    <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
      {tools.map(({ tool, label, shortcut, icon: Icon }, index) => (
        <span className={index === 2 || index === 5 || index === 8 ? 'tool-group-start' : ''} key={tool}>
          <IconButton label={label} shortcut={shortcut} active={activeTool === tool} onClick={() => setTool(tool)}>
            <Icon size={17} strokeWidth={1.8} />
          </IconButton>
        </span>
      ))}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="color-trigger" type="button" aria-label="Annotation color">
            <span style={{ background: color }} />
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
  )
}
