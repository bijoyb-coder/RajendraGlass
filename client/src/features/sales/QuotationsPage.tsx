import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Plus,
  X,
  FileText,
  ArrowRightCircle,
  UserPlus,
  Printer,
  Pencil,
  Lock,
} from "lucide-react";
import {
  useListQuotationsQuery,
  useCreateQuotationMutation,
  useUpdateQuotationMutation,
  useDeleteQuotationMutation,
  useCreateSalesOrderMutation,
  useLazyGetQuotationQuery,
} from "./salesExtraApi";
import {
  useListCustomersQuery,
  useListProductsQuery,
} from "../masters/mastersApi";
import SalesLineGrid, {
  emptyLine,
  isComplete,
  toCreateLine,
  fromSavedLine,
} from "./SalesLineGrid";
import type { SalesLine } from "./SalesLineGrid";
import { alertError, confirmAction } from "../../lib/alerts";
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from "../../components/DataGrid";
import type {
  CreateQuotationLine,
  QuotationDto,
  QuotationDiscountType,
} from "../../lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition";

function money(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

const statusStyles: Record<string, string> = {
  Sent: "bg-blue-50 text-blue-700 ring-blue-200",
  Converted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Expired: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** A converted quotation already has a sales order derived from it — editing it afterwards
 * would silently disconnect the two, so the server rejects it and the UI hides the option. */
function isEditable(status: string) {
  return status !== "Converted";
}

type SortKey = "quotationNo" | "quotationDate" | "customerName" | "totalValue" | "status";

/** Everything needed to put the in-progress form back exactly as it was, carried across the
 * navigation to Product Master and back via router state (see handleAddNewProduct). */
interface QuotationDraft {
  editingId: number | null;
  customerId: number | "";
  lines: SalesLine[];
  holeRate: number;
  bHoleRate: number;
  cutoutRate: number;
  bCutoutRate: number;
  roundOffEnabled: boolean;
  discountType: QuotationDiscountType;
  discountValue: number;
}

export default function QuotationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = useListQuotationsQuery();
  const { data: customers } = useListCustomersQuery();
  const { data: products } = useListProductsQuery();
  const [createQuotation, { isLoading: saving }] = useCreateQuotationMutation();
  const [updateQuotation, { isLoading: updating }] = useUpdateQuotationMutation();
  const [deleteQuotation] = useDeleteQuotationMutation();
  const [createSalesOrder, { isLoading: converting }] =
    useCreateSalesOrderMutation();
  const [fetchQuotation, { isFetching: loadingForEdit }] = useLazyGetQuotationQuery();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
  // One rate per hole/cutout type, entered once for the whole document -- not per line. Applied
  // to the sum of every line's own item-wise Hole/B-Hole/Cutout/B-Cutout quantity.
  const [holeRate, setHoleRate] = useState(0);
  const [bHoleRate, setBHoleRate] = useState(0);
  const [cutoutRate, setCutoutRate] = useState(0);
  const [bCutoutRate, setBCutoutRate] = useState(0);
  // Document-level "round to the nearest rupee" toggle -- not per line. Defaults on, matching
  // the auto-rounding this page always did before this became a visible choice.
  const [roundOffEnabled, setRoundOffEnabled] = useState(true);
  // Document-level discount -- not per line (every line's own discountPct is forced to 0, see
  // SalesLineGrid's discount prop). Applied to the whole quotation's basic amount right before
  // Round Off/Total.
  const [discountType, setDiscountType] = useState<QuotationDiscountType>("Percent");
  const [discountValue, setDiscountValue] = useState(0);
  // Set right after restoring a draft that came back from "+ Add New Product…" -- names the line
  // waiting to receive the product once useListProductsQuery's cache (invalidated by the create)
  // has actually refetched and includes it.
  const [pendingNewProduct, setPendingNewProduct] = useState<{ lineKey: string; productId: number } | null>(null);

  // Coming back from Product Master after "+ Add New Product…", or from Customer Entry after
  // "New Customer": restore the form exactly as it was, then either queue the new product to be
  // dropped into the line that asked for it (see the effect below, which waits for the product
  // list to actually include it) or select the newly created customer directly -- Customer's own
  // list is refetched by the time we land back here (CustomersPage's create already resolved
  // before navigating), so no equivalent wait-for-cache step is needed for it.
  useEffect(() => {
    const state = location.state as { restoreDraft?: QuotationDraft; targetLineKey?: string; newProductId?: number; newCustomerId?: number } | null;
    if (!state?.restoreDraft) return;
    const draft = state.restoreDraft;
    setEditingId(draft.editingId);
    setCustomerId(state.newCustomerId ?? draft.customerId);
    setLines(draft.lines);
    setHoleRate(draft.holeRate);
    setBHoleRate(draft.bHoleRate);
    setCutoutRate(draft.cutoutRate);
    setBCutoutRate(draft.bCutoutRate);
    setRoundOffEnabled(draft.roundOffEnabled);
    setDiscountType(draft.discountType);
    setDiscountValue(draft.discountValue);
    setShowForm(true);
    if (state.targetLineKey && state.newProductId) {
      setPendingNewProduct({ lineKey: state.targetLineKey, productId: state.newProductId });
    }
    // Consume the navigation state so refreshing or navigating back doesn't replay this restore.
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the newly created product actually shows up in the product list (its cache is
  // invalidated by the create, but the refetch is async), select it into the waiting line the
  // same way picking it from the dropdown would -- rate and thickness prefilled from the master.
  useEffect(() => {
    if (!pendingNewProduct || !products) return;
    const product = products.items.find((p) => p.productId === pendingNewProduct.productId);
    if (!product) return;
    setLines((prev) =>
      prev.map((l) =>
        l.key === pendingNewProduct.lineKey
          ? { ...l, productId: product.productId, rate: product.sellingRate ?? 0, thicknessMm: product.thicknessMm ?? 0 }
          : l,
      ),
    );
    setPendingNewProduct(null);
  }, [products, pendingNewProduct]);

  /** "+ Add New Product…" picked in a line's product dropdown: stash everything typed so far and
   * navigate to Product Master. Saving a product there returns here (see the effect above) with
   * the same data restored and the new product selected into this exact line. Navigating to
   * Product Master any other way (the main menu) never carries this state, so it behaves exactly
   * as it always has -- no redirect back here. */
  function handleAddNewProduct(lineKey: string) {
    const draft: QuotationDraft = {
      editingId, customerId, lines,
      holeRate, bHoleRate, cutoutRate, bCutoutRate, roundOffEnabled, discountType, discountValue,
    };
    navigate("/masters/products", { state: { returnTo: "quotation", targetLineKey: lineKey, draft } });
  }

  /** "New Customer": stash everything typed so far and navigate to the real Customer Entry page
   * (CustomersPage.tsx) -- same round trip as handleAddNewProduct above, just without a per-line
   * target since a quotation only ever has one customer. Saving there returns here (see the
   * restore effect above) with the same data restored and the new customer selected. */
  function handleAddNewCustomer() {
    const draft: QuotationDraft = {
      editingId, customerId, lines,
      holeRate, bHoleRate, cutoutRate, bCutoutRate, roundOffEnabled, discountType, discountValue,
    };
    navigate("/masters/customers", { state: { returnTo: "quotation", draft } });
  }

  // ---------- Data grid: search + sort over the fetched list ----------
  const {
    rows,
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
  } = useDataGrid<QuotationDto, SortKey>(
    data?.items,
    {
      defaultSortKey: "quotationDate",
      defaultSortDir: "desc",
      comparators: {
        quotationNo: (a, b) => (a.quotationNo ?? "").localeCompare(b.quotationNo ?? ""),
        quotationDate: (a, b) => new Date(a.quotationDate).getTime() - new Date(b.quotationDate).getTime(),
        customerName: (a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? ""),
        totalValue: (a, b) => a.totalValue - b.totalValue,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (q, term) =>
        !!q.quotationNo?.toLowerCase().includes(term) ||
        !!q.customerName?.toLowerCase().includes(term) ||
        q.status.toLowerCase().includes(term),
    },
  );

  function resetForm() {
    setEditingId(null);
    setLines([emptyLine()]);
    setCustomerId("");
    setHoleRate(0);
    setBHoleRate(0);
    setCutoutRate(0);
    setBCutoutRate(0);
    setRoundOffEnabled(true);
    setDiscountType("Percent");
    setDiscountValue(0);
  }

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  async function openEditForm(q: QuotationDto) {
    const full = await fetchQuotation(q.quotationId).unwrap();
    setEditingId(full.quotationId);
    setCustomerId(full.customerId);
    setLines(full.lines.length ? full.lines.map(fromSavedLine) : [emptyLine()]);
    setHoleRate(full.holeRate);
    setBHoleRate(full.bHoleRate);
    setCutoutRate(full.cutoutRate);
    setBCutoutRate(full.bCutoutRate);
    setRoundOffEnabled(full.roundOffEnabled);
    setDiscountType(full.discountType);
    setDiscountValue(full.discountValue);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      alertError("Customer required", "Select a customer, or add a new one.");
      return;
    }

    const valid = lines.filter(isComplete);
    if (valid.length === 0) {
      alertError(
        "No priceable lines",
        "Add at least one complete line — a size with quantity and rate, or an amount entered directly.",
      );
      return;
    }
    if (discountValue < 0 || (discountType === "Percent" && discountValue > 100)) {
      alertError(
        "Invalid discount",
        discountType === "Percent" ? "Discount % must be between 0 and 100." : "Discount amount cannot be negative.",
      );
      return;
    }

    // Stock is not checked here — a quotation is allowed to save even when it's short on stock
    // (the live per-row badge on each line is still shown, purely advisory).

    try {
      // Quotations don't carry GST, and discount is document-level now, not per line -- every
      // line is sent with gstPct/discountPct forced to 0 regardless of whatever value it happens
      // to hold (e.g. a legacy quotation loaded for edit).
      const payload: CreateQuotationLine[] = valid.map(toCreateLine).map((l) => ({ ...l, gstPct: 0, discountPct: 0 }));
      if (editingId) {
        await updateQuotation({
          id: editingId,
          body: { customerId: Number(customerId), lines: payload, holeRate, bHoleRate, cutoutRate, bCutoutRate, roundOffEnabled, discountType, discountValue },
        }).unwrap();
        setShowForm(false);
        resetForm();
      } else {
        const result = await createQuotation({
          customerId: Number(customerId),
          lines: payload,
          holeRate,
          bHoleRate,
          cutoutRate,
          bCutoutRate,
          roundOffEnabled,
          discountType,
          discountValue,
        }).unwrap();
        setShowForm(false);
        resetForm();
        // Flow A: offer to jump straight into Cutting with this quotation and its products
        // already loaded, so the operator never has to look it up and re-select it.
        const goToCutting = await confirmAction(
          "Quotation saved successfully",
          "Do you want to process Cutting?",
          "Yes, Process Cutting",
          "No",
        );
        if (goToCutting) navigate(`/sales/cutting/new?quotationId=${result.quotationId}`);
      }
    } catch (err: any) {
      alertError(
        editingId ? "Could not save the changes" : "Could not save the quotation",
        err?.data?.detail,
      );
    }
  }

  async function convertToOrder(
    quotationId: number,
    customerIdForOrder: number,
  ) {
    try {
      const full = await fetchQuotation(quotationId).unwrap();
      // Carry the whole line across — size, unit, rate basis, thickness and any override — so
      // the order prices to the same per-line figure as the quotation it came from. Every
      // quotation line carries gstPct=0 (quotations don't have GST) and discountPct=0 (discount
      // is document-level on the quotation, not carried per line), so the resulting order starts
      // GST-free and discount-free too; edit it there if the order itself needs either.
      const qLines: CreateQuotationLine[] = full.lines.map((l) => toCreateLine(fromSavedLine(l)));
      await createSalesOrder({
        customerId: customerIdForOrder,
        quotationId,
        lines: qLines,
      }).unwrap();
    } catch {
      // surfaced via list refresh; no-op
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Quotations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Priced offers sent to customers, convertible to a sales order.
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              openNewForm();
            }
          }}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}{" "}
          {showForm ? "Cancel" : "New Quotation"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-brand-800">
              {editingId ? `Edit Quotation` : "New Quotation"}
            </h2>
            {loadingForEdit && (
              <span className="text-xs text-slate-400">Loading…</span>
            )}
          </div>

          {/* ---------- Customer ---------- */}
          {/* A brand-new customer is created on the real Customer Entry page, not inline here --
              see handleAddNewCustomer, mirroring the existing "+ Add New Product…" round trip.
              Saving there returns here with this exact form restored and the new customer
              selected (see the restore effect above). */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Customer *
              </label>
              <select
                value={customerId}
                onChange={(e) =>
                  setCustomerId(e.target.value ? Number(e.target.value) : "")
                }
                className={inputClass}
              >
                <option value="">Select customer…</option>
                {customers?.items.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} ({c.customerType ?? "Retail"})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddNewCustomer}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 pb-2.5"
            >
              <UserPlus size={15} /> New Customer
            </button>
          </div>

          {/* ---------- Lines ---------- */}
          {/* Shared with the Sales Order screen so the two can never drift apart. Description is
              item-wise here (the grid's default) -- entered per line, not once for the whole
              document. */}
          <SalesLineGrid
            lines={lines}
            products={products}
            onChange={setLines}
            showGst={false}
            onAddNewProduct={handleAddNewProduct}
            roundOff={{ enabled: roundOffEnabled, onChange: setRoundOffEnabled }}
            discount={{
              type: discountType,
              value: discountValue,
              onChange: (patch) => {
                if (patch.type !== undefined) setDiscountType(patch.type);
                if (patch.value !== undefined) setDiscountValue(patch.value);
              },
            }}
            holesCutout={{
              holeRate,
              bHoleRate,
              cutoutRate,
              bCutoutRate,
              onChange: (patch) => {
                if (patch.holeRate !== undefined) setHoleRate(patch.holeRate);
                if (patch.bHoleRate !== undefined) setBHoleRate(patch.bHoleRate);
                if (patch.cutoutRate !== undefined) setCutoutRate(patch.cutoutRate);
                if (patch.bCutoutRate !== undefined) setBCutoutRate(patch.bCutoutRate);
              },
            }}
          />

          <div className="flex justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || updating}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60"
            >
              {saving || updating
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Save Quotation"}
            </button>
          </div>
        </form>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search quotation no., customer or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort("quotationNo")}>
                  Quotation No. <SortIcon column="quotationNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort("quotationDate")}>
                  Date <SortIcon column="quotationDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort("customerName")}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort("totalValue")} align="right">
                  Total <SortIcon column="totalValue" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort("status")}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <FileText size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? "No quotations match your search." : "No quotations yet."}
                  </td>
                </tr>
              )}
              {rows.map((q) => {
                const editable = isEditable(q.status);
                return (
                  <tr key={q.quotationId} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3 font-medium text-brand-700">
                      {q.quotationNo}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {new Date(q.quotationDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{q.customerName}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">
                      {money(q.totalValue)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[q.status] ?? statusStyles.Sent}`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        {q.status === "Sent" && (
                          <button
                            disabled={converting}
                            onClick={() =>
                              convertToOrder(q.quotationId, q.customerId)
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                          >
                            <ArrowRightCircle size={14} /> Convert to Order
                          </button>
                        )}
                        {editable ? (
                          <button
                            onClick={() => openEditForm(q)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                          >
                            <Pencil size={14} /> Edit
                          </button>
                        ) : (
                          <span
                            title="Already converted to a sales order — no longer editable"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 cursor-not-allowed"
                          >
                            <Lock size={13} /> Edit
                          </span>
                        )}
                        <Link
                          to={`/sales/quotations/${q.quotationId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                        >
                          <Printer size={14} /> View / Print
                        </Link>
                        <DeleteRowAction
                          canDelete={q.canDelete}
                          itemLabel={`quotation ${q.quotationNo ?? q.quotationId}`}
                          onDelete={() => deleteQuotation(q.quotationId).unwrap()}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DataGridPagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
