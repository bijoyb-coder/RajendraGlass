import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Trash2 } from "lucide-react";
import { confirmAction, alertError, alertSuccess } from "../lib/alerts";

/**
 * Client-side search + sort + pagination for a list screen's table, shared by every "data grid"
 * list page (Quotations, Sales Orders, …) so the behaviour is identical everywhere instead of
 * being reimplemented per page.
 */
export function useDataGrid<T, K extends string>(
  items: T[] | undefined,
  opts: {
    defaultSortKey: K;
    defaultSortDir?: "asc" | "desc";
    defaultPageSize?: number;
    /** One comparator per sortable column. */
    comparators: Record<K, (a: T, b: T) => number>;
    /** Row passes the search box if any of these return true for the current term. */
    matches?: (item: T, term: string) => boolean;
  },
) {
  const [search, setSearchState] = useState("");
  const [sortKey, setSortKey] = useState<K>(opts.defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(opts.defaultSortDir ?? "asc");
  const [pageSize, setPageSizeState] = useState(opts.defaultPageSize ?? 10);
  const [page, setPage] = useState(1);

  function toggleSort(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  /** Same as the plain setSearch, but also jumps back to page 1 — the usual list-UI expectation. */
  function setSearch(v: string) {
    setSearchState(v);
    setPage(1);
  }

  function setPageSize(n: number) {
    setPageSizeState(n);
    setPage(1);
  }

  const filteredSorted = useMemo(() => {
    const all = items ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term && opts.matches ? all.filter((item) => opts.matches!(item, term)) : all;
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = opts.comparators[sortKey];
    return cmp ? [...filtered].sort((a, b) => dir * cmp(a, b)) : filtered;
  }, [items, search, sortKey, sortDir, opts]);

  const totalCount = filteredSorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // If the result set shrinks (a narrower search, a page-size change, data reloading) and the
  // current page no longer exists, fall back to the last real page rather than showing nothing.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const currentPage = Math.min(page, pageCount);
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);
  const rows = useMemo(
    () => filteredSorted.slice(startIndex - 1, endIndex),
    [filteredSorted, startIndex, endIndex],
  );

  return {
    rows,
    /** The full search+sort result, unpaginated — for printing/exporting everything the user can currently see across all pages. */
    allRows: filteredSorted,
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
  };
}

export function SortIcon<K extends string>({ column, sortKey, sortDir }: { column: K; sortKey: K; sortDir: "asc" | "desc" }) {
  if (column !== sortKey) return <ArrowUpDown size={12} className="text-brand-300/60" />;
  return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

/**
 * Header row for every data grid: a deep brand-navy background with light uppercase text, so
 * the header reads as a distinct band above the data rather than blending into the card.
 */
export const DATA_GRID_HEAD_ROW_CLASS =
  "text-left text-xs uppercase tracking-wide text-brand-100 bg-brand-900";

/**
 * Body row for every data grid: alternating (zebra) shading so a wide row is easy to track
 * across the table, plus a solid hover shade that reads clearly against either stripe.
 */
export const DATA_GRID_ROW_CLASS =
  "odd:bg-white even:bg-gray-100 hover:bg-gray-300 transition-colors";

export function SortableTh({
  children,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-5 py-3 font-semibold select-none ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-white transition ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {children}
      </button>
    </th>
  );
}

/** A plain (non-sortable) header cell, styled to match SortableTh in the same header row. */
export function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-5 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

/** The rightmost header cell of every data grid — the row's action links/buttons live under it. */
export function ActionTh({ align = "right" }: { align?: "left" | "right" }) {
  return <Th align={align}>Action</Th>;
}

/**
 * The "Delete" row action shared by every list that only allows deleting a document while
 * nothing has been generated against it yet (Quotation → Sales Order → Sales Invoice, and
 * whatever else follows the same rule). Hidden outright when `canDelete` is false rather than
 * shown-disabled — a document that can never be deleted this way (e.g. already converted) has no
 * business showing a delete affordance at all.
 *
 * Pass `alwaysShow` to keep the button visible even when `canDelete` is false — the click still
 * confirms and attempts the delete, and a blocked delete surfaces the backend's specific reason
 * (`err?.data?.detail`) via the same SweetAlert error below, rather than hiding the affordance.
 * Use this where the reason itself is useful information (e.g. Products, where "why can't I
 * delete this" is a real question), not as the default for every list.
 */
export function DeleteRowAction({
  canDelete,
  itemLabel,
  onDelete,
  alwaysShow = false,
}: {
  canDelete: boolean;
  /** Names the row in the confirm dialog, e.g. "quotation RGC/QTN/26-27/00001". */
  itemLabel: string;
  onDelete: () => Promise<unknown>;
  /** Show the Delete button even when canDelete is false; a blocked attempt reports why via SweetAlert. */
  alwaysShow?: boolean;
}) {
  if (!canDelete && !alwaysShow) return null;
  async function handleClick() {
    const confirmed = await confirmAction(
      "Delete this record?",
      `This will permanently delete ${itemLabel}. This cannot be undone.`,
      "Yes, delete",
    );
    if (!confirmed) return;
    try {
      await onDelete();
      void alertSuccess("Deleted", `${itemLabel} was deleted.`);
    } catch (err: any) {
      void alertError("Could not delete", err?.data?.detail ?? `${itemLabel} could not be deleted.`);
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      title="Delete"
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600 transition"
    >
      <Trash2 size={13} /> Delete
    </button>
  );
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Toolbar above every data grid: an "entries per page" selector on the left, the search box on
 * the right — the classic DataTables layout. The page-size control is omitted (not just hidden)
 * when a page doesn't wire up pagination.
 */
export function DataGridSearchBar({
  value,
  onChange,
  placeholder,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  rightSlot,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  pageSize?: number;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
  /** Extra controls (e.g. a Print button) rendered between the page-size selector and the search box. */
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
      {onPageSizeChange ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-slate-300 pl-2 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries per page
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        {rightSlot}
        <div className="relative w-full sm:w-auto sm:max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
          />
        </div>
      </div>
    </div>
  );
}

/** A small toolbar button styled to match the data grid chrome — used for Print/Export actions. */
export function DataGridButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition shrink-0"
    >
      {children}
    </button>
  );
}

/**
 * Prints a clean, unpaginated view of a report's current (searched + sorted) rows — the "Print"
 * action every report tab shares, so the printed copy always matches what the user filtered/
 * sorted on screen rather than just whatever page happens to be visible.
 *
 * Renders into a hidden same-page iframe rather than window.open(): a new tab/window is a popup
 * as far as browsers are concerned and routinely gets silently blocked, even from a real click.
 * An iframe never triggers that blocker and prints with the same fidelity.
 */
export function printReport(opts: {
  title: string;
  subtitle?: string;
  columns: { label: string; align?: "left" | "right" }[];
  rows: (string | number)[][];
  totalRow?: (string | number | null)[];
}) {
  const { title, subtitle, columns, rows, totalRow } = opts;

  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

  const theadHtml = columns.map((c) => `<th style="text-align:${c.align === "right" ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const tbodyHtml = rows
    .map(
      (row) =>
        `<tr>${row.map((cell, i) => `<td style="text-align:${columns[i]?.align === "right" ? "right" : "left"}">${esc(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const tfootHtml = totalRow
    ? `<tfoot><tr>${totalRow.map((cell, i) => (cell === null ? "<td></td>" : `<td style="text-align:${columns[i]?.align === "right" ? "right" : "left"};font-weight:700;border-top:2px solid #333">${esc(cell)}</td>`)).join("")}</tr></tfoot>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .subtitle { font-size: 12px; color: #64748b; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #94a3b8; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  thead th { text-transform: uppercase; letter-spacing: 0.03em; font-size: 10px; color: #475569; border-bottom: 2px solid #334155; }
  tbody tr:nth-child(even) { background: #f8fafc; }
</style>
</head>
<body>
  <h1>Rajendra Glass Centre</h1>
  <p class="subtitle">${esc(title)}${subtitle ? " — " + esc(subtitle) : ""}</p>
  <p class="meta">Generated ${esc(new Date().toLocaleString("en-IN"))}</p>
  <table>
    <thead><tr>${theadHtml}</tr></thead>
    <tbody>${tbodyHtml || `<tr><td colspan="${columns.length}" style="text-align:center;color:#94a3b8;padding:24px">No data.</td></tr>`}</tbody>
    ${tfootHtml}
  </table>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Give the print dialog a moment to actually open before tearing the iframe down.
    setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return cleanup();
    win.focus();
    win.print();
    cleanup();
  };

  const doc = iframe.contentDocument;
  if (!doc) return cleanup();
  doc.open();
  doc.write(html);
  doc.close();
}

/**
 * Footer below every data grid: "Showing X to Y of Z entries" plus first/prev/numbered/next/last
 * page controls. Renders nothing when there's no data — an empty grid has nothing to page through.
 */
export function DataGridPagination({
  page,
  pageCount,
  totalCount,
  startIndex,
  endIndex,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount === 0) return null;

  // Window the page numbers so a large result set doesn't render hundreds of buttons: always
  // show the first and last page, plus a run of pages around the current one, with an ellipsis
  // filling any gap.
  const pages: (number | "…")[] = [];
  if (pageCount <= 7) {
    for (let p = 1; p <= pageCount; p++) pages.push(p);
  } else {
    pages.push(1);
    const lo = Math.max(2, page - 2);
    const hi = Math.min(pageCount - 1, page + 2);
    if (lo > 2) pages.push("…");
    for (let p = lo; p <= hi; p++) pages.push(p);
    if (hi < pageCount - 1) pages.push("…");
    pages.push(pageCount);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-100">
      <span className="text-xs text-slate-500">
        Showing {startIndex} to {endIndex} of {totalCount} entries
      </span>
      <div className="flex items-center gap-1">
        <PageButton disabled={page === 1} onClick={() => onPageChange(1)} label={<ChevronsLeft size={13} />} title="First page" />
        <PageButton disabled={page === 1} onClick={() => onPageChange(page - 1)} label={<ChevronLeft size={13} />} title="Previous page" />
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-slate-400">
              …
            </span>
          ) : (
            <PageButton key={p} active={p === page} onClick={() => onPageChange(p)} label={p} />
          ),
        )}
        <PageButton disabled={page === pageCount} onClick={() => onPageChange(page + 1)} label={<ChevronRight size={13} />} title="Next page" />
        <PageButton disabled={page === pageCount} onClick={() => onPageChange(pageCount)} label={<ChevronsRight size={13} />} title="Last page" />
      </div>
    </div>
  );
}

function PageButton({
  label,
  onClick,
  active,
  disabled,
  title,
}: {
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[28px] h-7 px-2 inline-flex items-center justify-center text-xs rounded-md border transition ${
        active
          ? "bg-brand-700 border-brand-700 text-white font-semibold"
          : disabled
            ? "border-slate-200 text-slate-300 cursor-not-allowed"
            : "border-slate-300 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}
