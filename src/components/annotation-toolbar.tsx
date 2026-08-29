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

export function AnnotationToolbar() {
  const activeTool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)
  const color = useEditorStore((state) => state.color)
  const setColor = useEditorStore((state) => state.setColor)

  const activeColor = annotationColors.find((item) => item.value === color)

  return (
    <div className="annotation-toolbar">
      <div className="tool-tray" role="toolbar" aria-label="Annotation tools">
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
              <span style={{ background: color }} />
              {activeColor?.name ?? 'Color'}
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
