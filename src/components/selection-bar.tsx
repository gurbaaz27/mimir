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

/**
 * Actions for whatever is selected on the page. Editing lives on the page
 * itself, so this only carries what a mark cannot express inline.
 */
export function SelectionBar() {
  const annotations = useEditorStore((state) => state.annotations)
  const selectedId = useEditorStore((state) => state.selectedAnnotationId)
  const update = useEditorStore((state) => state.updateAnnotation)
  const remove = useEditorStore((state) => state.deleteAnnotations)
  const annotation = annotations.find((item) => item.id === selectedId)

  if (!annotation) return null

  return (
    <Tooltip.Provider>
      <div className="selection-bar" role="group" aria-label="Selected annotation">
        <span>
          <b>{titleCase(annotation)}</b> · page {annotation.pageNumber}
        </span>
        <div className="selection-swatches">
          {annotationColors.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-label={item.name}
              aria-pressed={annotation.style.color === item.value}
              className={annotation.style.color === item.value ? 'is-active' : ''}
              style={{ background: item.value }}
              onClick={() =>
                void update(annotation.id, { style: { ...annotation.style, color: item.value } } as Partial<Annotation>)
              }
            />
          ))}
        </div>
        {annotation.kind === 'note' && (
          <IconButton
            label={annotation.resolved ? 'Reopen note' : 'Mark resolved'}
            icon={CheckIcon}
            active={annotation.resolved}
            onClick={() => void update(annotation.id, { resolved: !annotation.resolved } as Partial<Annotation>)}
          />
        )}
        <IconButton
          label="Delete annotation"
          shortcut="⌫"
          icon={TrashIcon}
          className="is-danger"
          onClick={() => void remove([annotation.id])}
        />
      </div>
    </Tooltip.Provider>
  )
}
