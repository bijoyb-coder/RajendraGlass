import { Previewer, Handler, registerHandlers } from 'pagedjs'

/** Plain browser printing can't repeat an arbitrary header on every page, doesn't know the total
 * page count, and gives no way to detect "this isn't the last page" for a continuation note --
 * `<table>` header/footer rows are the only thing that natively repeats. Paged.js actually lays the
 * content out into real page boxes first (so `counter(pages)` is a genuine total, not a guess),
 * which is what lets us do all three properly:
 *   - the ".pagedjs-print-header" block repeats on every page via CSS `position: running()` +
 *     `content: element(...)`.
 *   - "Page N of M" comes from `@page { @bottom-center { content: counter(page) ... } }`.
 *   - "Continued on page N+1" is added by us, only on pages where Paged.js's own layout hook tells
 *     us there's more content after this page (a non-null `breakToken`). */

let continuedNoteHandlerRegistered = false

function registerContinuedNoteHandler() {
  if (continuedNoteHandlerRegistered) return
  continuedNoteHandlerRegistered = true

  class ContinuedNoteHandler extends Handler {
    pageNum = 0

    afterPageLayout(pageElement: HTMLElement, _page: unknown, breakToken: unknown) {
      this.pageNum += 1

      if (!breakToken) return // no more content after this page -- it's the last one
      const bottomMarginContent = pageElement.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content')
      if (!bottomMarginContent) return
      const note = document.createElement('div')
      note.className = 'pagedjs-continued-note'
      note.textContent = `Continued on page ${this.pageNum + 1}`
      bottomMarginContent.appendChild(note)
    }
  }

  registerHandlers(ContinuedNoteHandler)
}

const PAGE_CSS = `
  @page {
    size: A4;
    /* .pagedjs-print-header is a position:running() element -- it never occupies space in the
       normal content flow on ANY page (page 1 included); it only ever appears via the element()
       reference below. So the top margin has to be tall enough to hold it on every single page,
       not just from page 2 onward. Measured at ~84mm for the Purchase Invoice header (logo, title,
       10-field detail grid). The Sales Invoice header is taller still (adds a Seller/Buyer grid
       and, when present, the e-Invoice QR block), so 105mm leaves a safe margin for both without
       per-invoice-type tuning. */
    margin: 105mm 14mm 20mm 14mm;
    @top-center {
      content: element(pagedjsPrintHeader);
    }
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 9px;
      color: #94a3b8;
    }
  }
  .pagedjs-print-header {
    position: running(pagedjsPrintHeader);
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

    const previewer = new Previewer()
    // outerHTML, not the live node -- Paged.js's ContentParser takes ownership of whatever DOM
    // node it's handed (moving it into its own flow), so passing the real element would rip the
    // invoice out of the page behind the scenes. A markup string is parsed into a fresh,
    // disposable tree.
    await previewer.preview(sourceEl.outerHTML, stylesheets, container)

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
