import { Tooltip } from 'radix-ui'
import { CheckIcon, TrashIcon } from '#/components/icons'
import type { Annotation } from '#/lib/annotations'
import { annotationColors, annotationLabel } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'
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
      <div className="selection-bar" role="group" aria-label={selected.length === 1 ? 'Selected annotation' : `${selected.length} selected annotations`}>
        <span>
          <b>{label}</b>
        </span>
        <div className="selection-swatches">
          {annotationColors.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-label={item.name}
              aria-pressed={allSameColor && annotation.style.color === item.value}
              className={allSameColor && annotation.style.color === item.value ? 'is-active' : ''}
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
          className="is-danger"
          onClick={() => void remove(selected.map((item) => item.id), `Delete ${selected.length} annotations`)}
        />
      </div>
    </Tooltip.Provider>
  )
}
