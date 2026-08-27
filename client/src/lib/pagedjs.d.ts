/** Paged.js ships no type declarations (and there's no @types/pagedjs package) -- this covers
 * only the small slice of its API pagedPrint.ts actually uses. */
declare module 'pagedjs' {
  export class Handler {
    chunker: unknown
    polisher: unknown
    caller: unknown
    constructor(chunker: unknown, polisher: unknown, caller: unknown)
  }

  export class Previewer {
    preview(
      content: string | Node,
      stylesheets: (string | Record<string, string>)[],
      renderTo: Element,
    ): Promise<{ pages: unknown[]; total: number }>
  }

  export function registerHandlers(...handlers: Array<new (...args: never[]) => Handler>): void
}
