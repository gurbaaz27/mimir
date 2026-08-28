import { useEffect, useState } from 'react'
import { Bot, Check, MessageSquareText, Trash2, X } from 'lucide-react'
import type { Annotation } from '#/lib/annotations'
import { annotationColors } from '#/lib/annotations'
import { useEditorStore } from '#/lib/editor-store.client'

function annotationLabel(annotation: Annotation) {
  if (annotation.kind === 'markup') return annotation.markup === 'strikeout' ? 'Strikeout' : annotation.markup[0]?.toUpperCase() + annotation.markup.slice(1)
  if (annotation.kind === 'shape') return annotation.shape[0]?.toUpperCase() + annotation.shape.slice(1)
  return annotation.kind[0]?.toUpperCase() + annotation.kind.slice(1)
}

function annotationSummary(annotation: Annotation) {
  if (annotation.kind === 'markup') return annotation.selectedText
  if (annotation.kind === 'text' || annotation.kind === 'note') return annotation.body || 'Empty annotation'
  if (annotation.kind === 'ink') return `${annotation.strokes.length} stroke${annotation.strokes.length === 1 ? '' : 's'}`
  return `${annotation.shape} on page ${annotation.pageNumber}`
}

function AnnotationDetail({ annotation }: { annotation: Annotation }) {
  const update = useEditorStore((state) => state.updateAnnotation)
  const remove = useEditorStore((state) => state.deleteAnnotations)
  const [body, setBody] = useState(annotation.kind === 'text' || annotation.kind === 'note' ? annotation.body : '')

  useEffect(() => {
    setBody(annotation.kind === 'text' || annotation.kind === 'note' ? annotation.body : '')
  }, [annotation])

  const updateStyle = (color: string) => {
    void update(annotation.id, { style: { ...annotation.style, color } } as Partial<Annotation>)
  }

  return (
    <div className="annotation-detail">
      <div className="detail-meta">
        <span>{annotationLabel(annotation)}</span>
        <span>Page {annotation.pageNumber}</span>
        {annotation.lastModifiedBy === 'webmcp' && <span className="agent-chip"><Bot size={12} /> Agent</span>}
      </div>
      {(annotation.kind === 'text' || annotation.kind === 'note') ? (
        <label className="annotation-body-field">
          <span>{annotation.kind === 'note' ? 'Comment' : 'Text'}</span>
          <textarea
            value={body}
            placeholder={annotation.kind === 'note' ? 'Add your thought…' : 'Type on the page…'}
            onChange={(event) => setBody(event.target.value)}
            onBlur={() => {
              if (body !== annotation.body) void update(annotation.id, { body } as Partial<Annotation>)
            }}
          />
        </label>
      ) : annotation.kind === 'markup' ? (
        <blockquote>{annotation.selectedText}</blockquote>
      ) : null}
      <div className="detail-section">
        <span>Color</span>
        <div className="detail-colors">
          {annotationColors.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-label={item.name}
              className={annotation.style.color === item.value ? 'is-active' : ''}
              style={{ background: item.value }}
              onClick={() => updateStyle(item.value)}
            >
              {annotation.style.color === item.value && <Check size={11} />}
            </button>
          ))}
        </div>
      </div>
      {annotation.kind === 'note' && (
        <button
          type="button"
          className="resolve-button"
          onClick={() => void update(annotation.id, { resolved: !annotation.resolved } as Partial<Annotation>)}
        >
          <Check size={14} /> {annotation.resolved ? 'Reopen comment' : 'Mark resolved'}
        </button>
      )}
      <button type="button" className="delete-annotation" onClick={() => void remove([annotation.id])}>
        <Trash2 size={14} /> Delete annotation
      </button>
    </div>
  )
}

export function AnnotationInspector() {
  const annotations = useEditorStore((state) => state.annotations)
  const currentPage = useEditorStore((state) => state.currentPage)
  const selectedId = useEditorStore((state) => state.selectedAnnotationId)
  const setSelected = useEditorStore((state) => state.setSelectedAnnotation)
  const setOpen = useEditorStore((state) => state.setInspectorOpen)
  const [currentOnly, setCurrentOnly] = useState(false)
  const selected = annotations.find((annotation) => annotation.id === selectedId)
  const visible = currentOnly ? annotations.filter((annotation) => annotation.pageNumber === currentPage) : annotations

  return (
    <aside className="annotation-inspector" aria-label="Annotations">
      <header>
        <div><h2>Annotations</h2><span>{annotations.length}</span></div>
        <button type="button" aria-label="Close annotations panel" onClick={() => setOpen(false)}><X size={17} /></button>
      </header>
      {selected ? (
        <>
          <button className="back-to-comments" type="button" onClick={() => setSelected(null)}>← All annotations</button>
          <AnnotationDetail annotation={selected} />
        </>
      ) : (
        <>
          <div className="inspector-filter">
            <button type="button" className={!currentOnly ? 'is-active' : ''} onClick={() => setCurrentOnly(false)}>All</button>
            <button type="button" className={currentOnly ? 'is-active' : ''} onClick={() => setCurrentOnly(true)}>Page {currentPage}</button>
          </div>
          <div className="annotation-list">
            {visible.length ? visible.map((annotation) => (
              <button
                type="button"
                className="annotation-list-item"
                key={annotation.id}
                onClick={() => {
                  setSelected(annotation.id)
                  window.dispatchEvent(new CustomEvent('mimir:navigate', { detail: { pageNumber: annotation.pageNumber } }))
                }}
              >
                <span className="annotation-kind" style={{ '--item-color': annotation.style.color } as React.CSSProperties}>
                  {annotation.kind === 'note' ? <MessageSquareText size={14} /> : annotationLabel(annotation).slice(0, 1)}
                </span>
                <span className="annotation-copy">
                  <strong>{annotationLabel(annotation)} <small>Page {annotation.pageNumber}</small></strong>
                  <span>{annotationSummary(annotation)}</span>
                </span>
                {annotation.lastModifiedBy === 'webmcp' && <Bot className="list-agent" size={13} />}
              </button>
            )) : (
              <div className="panel-empty">
                <MessageSquareText size={25} />
                <h3>{currentOnly ? 'Nothing on this page' : 'Your thinking lives here'}</h3>
                <p>Select text to highlight it, or place a note beside an idea worth returning to.</p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
