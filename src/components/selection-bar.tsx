import { Tooltip } from 'radix-ui'
import { CheckIcon, TrashIcon } from '#/components/icons'
import type { Annotation } from '#/lib/annotations'
import { annotationColors, annotationLabel } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'
import { cn } from '#/lib/utils'
import { IconButton } from './ui'

function titleCase(annotation: Annotation) {
  const name = annotationLabel(annotation)
  return name[0]?.toUpperCase() + name.slice(1)
}

/** Actions for the current selection. Multi-selection actions are committed as one command. */
export function SelectionBar() {
  const annotations = useEditorStore((state) => state.annotations)
  const selectedIds = useEditorStore((state) => state.selectedAnnotationIds)
  const update = useEditorStore((state) => state.updateAnnotations)
  const remove = useEditorStore((state) => state.deleteAnnotations)
  const selected = annotations.filter((item) => selectedIds.includes(item.id))
  const annotation = selected[0]
  const deleteShortcut = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'Delete' : 'Backspace'

  if (!annotation) return null

  const allSameColor = selected.every((item) => item.style.color === annotation.style.color)
  const label = selected.length === 1 ? titleCase(annotation) : `${selected.length} annotations`

  return (
    <Tooltip.Provider>
      <div data-selection-bar className="absolute bottom-5 left-1/2 z-14 flex -translate-x-1/2 animate-selection-in items-center gap-[5px] rounded-[14px] border border-line bg-paper p-1.5 shadow-menu max-[820px]:bottom-3.5" role="group" aria-label={selected.length === 1 ? 'Selected annotation' : `${selected.length} selected annotations`}>
        <span className="py-0 pr-2 pl-1.5 text-[11px] text-muted whitespace-nowrap">
          <b className="font-[560] text-ink">{label}</b>
        </span>
        <div className="flex items-center gap-1.5 border-x border-line px-2">
          {annotationColors.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-label={item.name}
              aria-pressed={allSameColor && annotation.style.color === item.value}
              className={cn(
                'grid size-5 place-items-center rounded-full border-2 border-paper p-0 text-paper shadow-[0_0_0_1px_var(--color-line-strong)] transition-transform duration-140 ease-spring hover:scale-114',
                allSameColor && annotation.style.color === item.value && 'shadow-[0_0_0_2px_var(--color-ink)]',
              )}
              style={{ background: item.value }}
              onClick={() => void update(selected.map((item) => item.id), { style: { color: item.value } }, 'human', 'Change annotation colors')}
            />
          ))}
        </div>
        {selected.length === 1 && annotation.kind === 'note' && (
          <IconButton
            label={annotation.resolved ? 'Reopen note' : 'Mark resolved'}
            icon={CheckIcon}
            active={annotation.resolved}
            onClick={() => void update([annotation.id], { resolved: !annotation.resolved }, 'human', 'Edit annotation')}
          />
        )}
        <IconButton
          label={selected.length === 1 ? 'Delete annotation' : `Delete ${selected.length} annotations`}
          shortcut={deleteShortcut}
          icon={TrashIcon}
          danger
          onClick={() => void remove(selected.map((item) => item.id), `Delete ${selected.length} annotations`)}
        />
      </div>
    </Tooltip.Provider>
  )
}
