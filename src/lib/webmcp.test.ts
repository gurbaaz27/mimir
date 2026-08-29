import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { annotationStyleSchema, annotationSummary, createAnnotationBase, type Annotation } from './annotations'
import {
  applicableFields,
  createAnnotationsInput,
  formatToolError,
  partitionDeletable,
  styleInputSchema,
  toJsonSchema,
  ToolError,
  updateAnnotationsInput,
} from './webmcp-contract'

type SchemaBranch = {
  properties: { kind: { const: string }; shape?: { enum: Array<string> } }
  required: Array<string>
}

/** The item branches an agent picks between, with the nested shape union flattened. */
function branches(): Array<SchemaBranch> {
  const schema = toJsonSchema(createAnnotationsInput) as {
    properties: { annotations: { items: { oneOf: Array<SchemaBranch | { oneOf: Array<SchemaBranch> }> } } }
  }
  return schema.properties.annotations.items.oneOf.flatMap((branch) =>
    'oneOf' in branch ? branch.oneOf : [branch],
  )
}

function branchKinds() {
  return branches().map((branch) => branch.properties.kind.const)
}

const style = { color: '#159b98', opacity: 0.85, strokeWidth: 2 }

function markup(author: Annotation['createdBy'] = 'webmcp'): Annotation {
  return {
    ...createAnnotationBase('document-1', 3, author, style),
    kind: 'markup',
    markup: 'highlight',
    selectedText: 'Structured annotations remain portable across tools and sessions.',
    quads: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.02 }],
  }
}

function note(author: Annotation['createdBy'] = 'human'): Annotation {
  return {
    ...createAnnotationBase('document-1', 1, author, style),
    kind: 'note',
    point: { x: 0.5, y: 0.5 },
    body: 'Check the methodology.',
    resolved: false,
  }
}

describe('the published tool contract', () => {
  it('exposes every branch of the annotation union an agent has to construct', () => {
    expect(branchKinds()).toEqual(['markup', 'note', 'text', 'shape', 'shape', 'ink'])
  })

  it('splits shapes by subtype so the required geometry is visible, not guessed', () => {
    const shapes = branches().filter((branch) => branch.properties.kind.const === 'shape')
    expect(shapes.map((branch) => branch.properties.shape?.enum)).toEqual([
      ['rectangle', 'ellipse'],
      ['line', 'arrow'],
    ])
    expect(shapes[0]?.required).toEqual(['kind', 'pageNumber', 'shape', 'bounds'])
    expect(shapes[1]?.required).toEqual(['kind', 'pageNumber', 'shape', 'start', 'end'])
  })

  it('refuses geometry the renderer would draw as the wrong shape', () => {
    const asLine = { kind: 'shape', pageNumber: 1, shape: 'line', bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }
    const asBox = { kind: 'shape', pageNumber: 1, shape: 'rectangle', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
    expect(createAnnotationsInput.safeParse({ annotations: [asLine] }).success).toBe(false)
    expect(createAnnotationsInput.safeParse({ annotations: [asBox] }).success).toBe(false)
    expect(
      createAnnotationsInput.safeParse({
        annotations: [{ ...asBox, start: undefined, end: undefined, bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
      }).success,
    ).toBe(true)
  })

  it('describes the fields of a branch rather than leaving them to guesswork', () => {
    expect(branches()[0]?.required).toEqual(['kind', 'pageNumber', 'markup', 'target'])
  })

  it('accepts a quote-anchored highlight and rejects one without a target', () => {
    const valid = createAnnotationsInput.safeParse({
      annotations: [{ kind: 'markup', pageNumber: 2, markup: 'highlight', target: { quote: 'a real sentence' } }],
    })
    expect(valid.success).toBe(true)
    expect(createAnnotationsInput.safeParse({ annotations: [{ kind: 'markup', pageNumber: 2, markup: 'highlight' }] }).success).toBe(false)
  })

  it('spells out which update fields exist and what they apply to', () => {
    const schema = toJsonSchema(updateAnnotationsInput) as {
      properties: { updates: { items: { properties: Record<string, { description?: string }>; required: Array<string> } } }
    }
    const update = schema.properties.updates.items
    expect(Object.keys(update.properties).sort()).toEqual(['body', 'id', 'resolved', 'style'])
    expect(update.required).toEqual(['id'])
    expect(update.properties.resolved?.description).toContain('Note annotations only')
  })
})

describe('the input contract matches what can be persisted', () => {
  it('refuses a style the annotation schema would refuse', () => {
    // The published contract must not advertise a value that fails on write.
    expect(annotationStyleSchema.safeParse({ ...style, color: '' }).success).toBe(false)
    expect(styleInputSchema.safeParse({ color: '' }).success).toBe(false)
    expect(styleInputSchema.safeParse({ color: '#159b98', opacity: 0.5 }).success).toBe(true)
  })
})

describe('failures an agent can act on', () => {
  it('turns a Zod issue into a readable field path', () => {
    const error = createAnnotationsInput.safeParse({
      annotations: [{ kind: 'note', pageNumber: 1, body: 'ok' }, { kind: 'note', pageNumber: 1 }],
    }).error
    const message = formatToolError(error)
    expect(message).toContain('annotations[1]')
    expect(message).not.toContain('[object Object]')
  })

  it('carries the recovery hint alongside the failure', () => {
    const message = formatToolError(new ToolError('The quote was not found on page 3.', 'It appears on page 7.'))
    expect(message).toBe('The quote was not found on page 3. It appears on page 7.')
  })

  it('passes ordinary errors through unchanged', () => {
    expect(formatToolError(new Error('No active document is available.'))).toBe('No active document is available.')
  })

  it('names the offending path even for a bare value', () => {
    const error = z.object({ limit: z.number() }).safeParse({ limit: 'eight' }).error
    expect(formatToolError(error)).toBe('Invalid input — limit: Invalid input: expected number, received string')
  })
})

describe('protecting the reader’s own marks', () => {
  it('skips human annotations unless deletion is explicitly widened', () => {
    const agentMark = markup('webmcp')
    const humanMark = note('human')
    const annotations = [agentMark, humanMark]

    const guarded = partitionDeletable(annotations, [agentMark.id, humanMark.id], false)
    expect(guarded.deletable).toEqual([agentMark])
    expect(guarded.skipped).toEqual([{ id: humanMark.id, reason: 'created_by_human' }])

    const widened = partitionDeletable(annotations, [agentMark.id, humanMark.id], true)
    expect(widened.deletable).toHaveLength(2)
    expect(widened.skipped).toEqual([])
  })

  it('reports ids that do not exist separately from ones it refuses', () => {
    const { deletable, skipped } = partitionDeletable([note('human')], ['missing-id'], true)
    expect(deletable).toEqual([])
    expect(skipped).toEqual([{ id: 'missing-id', reason: 'not_found' }])
  })
})

describe('which fields a kind can accept', () => {
  it('allows body and resolved on a note, and only style on markup', () => {
    expect(applicableFields(note())).toEqual({ body: true, resolved: true, style: true })
    expect(applicableFields(markup())).toEqual({ body: false, resolved: false, style: true })
  })
})

describe('compact annotation summaries', () => {
  it('drops geometry and keeps what an agent reasons about', () => {
    const summary = annotationSummary(markup())
    expect(summary).not.toHaveProperty('quads')
    expect(summary.label).toBe('highlight')
    expect(summary.text).toContain('Structured annotations')
    expect(summary.createdBy).toBe('webmcp')
  })

  it('truncates long bodies and says so', () => {
    const long = { ...note(), body: 'x'.repeat(500) } as Annotation
    const summary = annotationSummary(long, 100)
    expect(summary.truncated).toBe(true)
    expect(summary.text).toHaveLength(101)
  })

  it('reports resolved state only where it exists', () => {
    expect(annotationSummary(note())).toHaveProperty('resolved', false)
    expect(annotationSummary(markup())).not.toHaveProperty('resolved')
  })
})
