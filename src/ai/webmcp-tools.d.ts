/**
 * `webmcp-types` (0.1.5) predates the tool-execution half of the WebMCP spec:
 * it types `registerTool` and `getTools`, but not `executeTool`, which Chrome
 * ships behind the WebMCP flag and the spec defines as the way a page invokes a
 * tool it discovered. Declared optional on purpose — a browser without the flag
 * has no `executeTool`, and the bridge has to check before it calls.
 *
 * @see https://developer.chrome.com/docs/ai/webmcp/imperative-api
 */
declare namespace WebMCP {
  interface ModelContext {
    /**
     * Execute a tool returned by `getTools`. Input is a JSON *string*, not an
     * object — the spec passes arguments the way an agent would send them.
     * Resolves with the tool's return value, or `null` when the call triggered
     * a navigation.
     */
    executeTool?(
      tool: RegisteredTool,
      input: string,
      options?: { signal?: AbortSignal },
    ): Promise<unknown>
  }
}
