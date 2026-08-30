import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Mimir's WebMCP surface is a couple of dozen tools whose input shapes have
 * nothing in common, and the set changes with whatever document is open. Rather
 * than mirror every one of them as a model-facing tool — a catalogue the server
 * would have to keep in step with the browser by hand — the model gets two:
 * one to read the live catalogue, one to invoke anything in it.
 *
 * Both are definitions only. Execution belongs to the browser tab, because that
 * is where `document.modelContext` and the open PDF actually live.
 */

export const listWebmcpToolsDef = toolDefinition({
  name: 'list_webmcp_tools',
  description:
    'List the WebMCP tools this page currently exposes, with each tool’s name, description, JSON Schema for its input, and whether it only reads. Call this before your first run_webmcp_tool: the catalogue depends on what is open, so a tool that existed in an earlier conversation may be gone, and the schemas here are the only source of truth for what "args" must contain.',
  inputSchema: z.object({}),
})

export const runWebmcpToolDef = toolDefinition({
  name: 'run_webmcp_tool',
  description:
    'Execute one WebMCP tool on this page and return its result. Look the tool up with list_webmcp_tools first, then pass its exact name as "title" and an object matching that tool’s inputSchema as "args".',
  inputSchema: z.object({
    title: z
      .string()
      .describe('The exact "name" of a tool from list_webmcp_tools, e.g. "search_document". Not its human-readable title.'),
    args: z
      .record(z.string(), z.unknown())
      .describe(
        'The tool’s input, shaped exactly as its inputSchema requires. Pass {} for a tool that takes no input. Omitted or misspelled fields fail the whole call — nothing partial is applied.',
      ),
  }),
})
