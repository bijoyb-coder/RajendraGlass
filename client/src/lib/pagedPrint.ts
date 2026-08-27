import { Previewer, Handler, registerHandlers } from 'pagedjs'

/** Plain browser printing can't repeat an arbitrary header on every page, doesn't know the total
 * page count, and gives no way to detect "this isn't the last page" for a continuation note --
 * `<table>` header/footer rows are the only thing that natively repeats. Paged.js actually lays the
 * content out into real page boxes first (so `counter(pages)` is a genuine total, not a guess),
 * which is what lets us do all three properly:
 *   - a short ".pagedjs-print-header-compact" block (brand + document title only, no detail grid)
 *     repeats on every page from page 2 onward via CSS `position: running()` + `content:
 *     element(...)`. Page 1 shows the real, full header (logo/title/detail grid) completely
 *     normally, as part of the ordinary document flow -- it's a *separate* element from the
 *     compact one, not the same block reused, because a `position: running()` element is removed
 *     from the flow everywhere it would appear, including on the very page where it's first
 *     encountered; there'd be no way to show the full header in its natural place on page 1 and
 *     still have it available to repeat (compactly) from page 2 on if it were the one element
 *     doing both jobs.
 *   - "Page N of M" comes from `@page { @bottom-center { content: counter(page) ... } }`.
 *   - "Continued on page N+1" is added by us, only on pages where Paged.js's own layout hook tells
 *     us there's more content after this page (a non-null `breakToken`). */

let continuedNoteHandlerRegistered = false

function registerContinuedNoteHandler() {
  if (continuedNoteHandlerRegistered) return
  continuedNoteHandlerRegistered = true

  class ContinuedNoteHandler extends Handler {
    afterPageLayout(pageElement: HTMLElement, _page: unknown, breakToken: unknown) {
      // The page's position among its siblings in the live DOM, not a counter incremented once
      // per hook call -- self-correcting across Paged.js's own cancel-and-retry loop (it can
      // re-run a page's layout mid-pass, e.g. after detecting overflow, re-invoking this hook for
      // a page it already touched), where a manually incremented count would drift.
      const chunker = this.chunker as { pagesArea?: Element } | undefined
      const pageIndex = chunker?.pagesArea ? [...chunker.pagesArea.children].indexOf(pageElement) : -1

      // The compact running header (".pagedjs-print-header-compact") mirrors into every page's own
      // top margin box, page 1 included -- but page 1 already shows the real, full header normally
      // in its own content flow, so the margin-box copy there would just duplicate it. Clear it on
      // page 1 only; every later page still needs its copy.
      if (pageIndex === 0) {
        const topMarginContent = pageElement.querySelector('.pagedjs_margin-top-center .pagedjs_margin-content')
        if (topMarginContent) topMarginContent.innerHTML = ''
      }

      if (!breakToken) return // no more content after this page -- it's the last one
      const bottomMarginContent = pageElement.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content')
      if (!bottomMarginContent) return
      // Same cancel-and-retry loop as above -- without this guard a retry adds a second (or third)
      // "Continued..." line to the same margin box instead of replacing it.
      if (bottomMarginContent.querySelector('.pagedjs-continued-note')) return

      const note = document.createElement('div')
      note.className = 'pagedjs-continued-note'
      note.textContent = pageIndex >= 0 ? `Continued on page ${pageIndex + 2}` : 'Continued on next page'
      bottomMarginContent.appendChild(note)
    }
  }

  registerHandlers(ContinuedNoteHandler)
}

const PAGE_CSS = `
  @page {
    size: A4;
    /* Only needs room for the *compact* running header now (brand name + document title, one row)
       -- the full header with its detail grid stays in the normal flow on page 1 and never uses
       this margin box at all. 30mm comfortably fits the compact row for both invoice types. */
    margin: 30mm 14mm 20mm 14mm;
    @top-center {
      content: element(pagedjsPrintHeaderCompact);
    }
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 9px;
      color: #94a3b8;
    }
  }
  .pagedjs-print-header-compact {
    position: running(pagedjsPrintHeaderCompact);
  }
  .pagedjs-continued-note {
    font-size: 9px;
    font-style: italic;
    color: #64748b;
    margin-top: 2px;
    text-align: center;
  }
  html, body { margin: 0; background: white; }
`

/** Prints `sourceEl` (a detached clone of it, never the live element itself) through Paged.js
 * instead of a plain `window.print()`, so a multi-page invoice gets a repeated header, real page
 * numbers, and a "Continued on page N" note on every page but the last. */
let printInProgress = false

export async function printPaged(sourceEl: HTMLElement) {
  // Pagination takes a moment, so a second click before the first run finishes (or the print
  // dialog has closed) used to leave two `#pagedjs-print-root` containers in the document at
  // once -- both visible to the print engine simultaneously, producing a merged, half-finished
  // result (one run's pages, plus a second run's still-mid-layout page with no total page count
  // yet). Ignore any call that arrives while one is already in flight instead.
  if (printInProgress) return
  printInProgress = true

  try {
    registerContinuedNoteHandler()

    // Guard against any leftover container from an interrupted previous run (e.g. the tab was
    // closed mid-print) rather than trusting `printInProgress` alone.
    document.querySelectorAll('#pagedjs-print-root').forEach((el) => el.remove())

    // The app's own compiled stylesheet -- needed so the cloned invoice markup keeps its Tailwind
    // classes' actual styling once it's re-parsed into Paged.js's separate rendering pipeline.
    const stylesheetHref = [...document.styleSheets]
      .map((s) => s.href)
      .find((href): href is string => !!href && href.includes('/assets/'))

    const container = document.createElement('div')
    container.id = 'pagedjs-print-root'
    document.body.appendChild(container)

    const stylesheets: (string | Record<string, string>)[] = []
    if (stylesheetHref) stylesheets.push(stylesheetHref)
    stylesheets.push({ 'pagedjs-print.css': PAGE_CSS })

    // Build the compact running header by cloning the brand/title row straight out of the source
    // markup -- rather than rendering a second copy of it in the component itself -- so there's
    // only ever one place in the app's own UI that defines it. This clone only ever exists inside
    // this disposable string; it never touches the live page.
    const scratch = document.createElement('div')
    scratch.innerHTML = sourceEl.outerHTML
    const brandRow = scratch.querySelector('.pagedjs-header-brand-row')
    if (brandRow) {
      const compactHeader = document.createElement('div')
      compactHeader.className = 'pagedjs-print-header-compact'
      compactHeader.appendChild(brandRow.cloneNode(true))
      scratch.firstElementChild?.insertBefore(compactHeader, scratch.firstElementChild.firstChild)
    }

    const previewer = new Previewer()
    // outerHTML, not the live node -- Paged.js's ContentParser takes ownership of whatever DOM
    // node it's handed (moving it into its own flow), so passing the real element would rip the
    // invoice out of the page behind the scenes. A markup string is parsed into a fresh,
    // disposable tree.
    await previewer.preview(scratch.innerHTML, stylesheets, container)

    document.body.classList.add('pagedjs-printing')

    function cleanup() {
      document.body.classList.remove('pagedjs-printing')
      container.remove()
      window.removeEventListener('afterprint', cleanup)
      printInProgress = false
    }
    window.addEventListener('afterprint', cleanup)

    window.print()
  } catch (err) {
    printInProgress = false
    throw err
  }
}
