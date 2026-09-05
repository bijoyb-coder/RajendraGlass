import { useEffect, useRef, useState } from "react";
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
import { calcLine, isComplete, toCreateLine, fromSavedLine } from "./SalesLineGrid";
import type { SalesLine } from "./SalesLineGrid";
import QuotationItemEntry, { type QuotationItemEntryHandle } from "./QuotationItemEntry";
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
 * navigation to Product Master / Customer Entry and back (see handleAddNewProduct/Customer). */
interface QuotationDraft {
  editingId: number | null;
  customerId: number | "";
  lines: SalesLine[];
  /** The item still sitting in the "Add Item" entry form (not yet added to `lines`) when the
   * operator left for "+ Add New Product…" -- restored into QuotationItemEntry via its
   * initialItem prop so nothing typed is lost. */
  pendingItem?: SalesLine;
  pendingEditingKey?: string | null;
  holeRate: number;
  bHoleRate: number;
  cutoutRate: number;
  bCutoutRate: number;
  roundOffEnabled: boolean;
  discountType: QuotationDiscountType;
  discountValue: number;
  termsConditions: string;
  notes: string;
  otherChargesAmount: number;
  taxPct: number;
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
  /** The saved number/date of the quotation being edited, so panel 1 can show the real ones
   * instead of the "auto-generated on save" placeholders a new quotation gets. */
  const [editingHeader, setEditingHeader] = useState<{ quotationNo: string; quotationDate: string } | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [lines, setLines] = useState<SalesLine[]>([]);
  // One rate per hole/cutout type, entered once for the whole document -- not per line. Applied
  // to the sum of every line's own item-wise Hole/B-Hole/Cutout/B-Cutout quantity.
  const [holeRate, setHoleRate] = useState(0);
  const [bHoleRate, setBHoleRate] = useState(0);
  const [cutoutRate, setCutoutRate] = useState(0);
  const [bCutoutRate, setBCutoutRate] = useState(0);
  // Document-level "round to the nearest rupee" toggle -- not per line. Defaults on, matching
  // the auto-rounding this page always did before this became a visible choice.
  const [roundOffEnabled, setRoundOffEnabled] = useState(true);
  // Document-level discount -- not per line (every line's own discountPct is forced to 0).
  // Applied to the whole quotation's basic amount right before Other Charges/Tax/Round Off/Total.
  const [discountType, setDiscountType] = useState<QuotationDiscountType>("Percent");
  const [discountValue, setDiscountValue] = useState(0);
  // Flat document-level charge, added after Discount, before Tax -- distinct from each item's
  // own Hardware/Transport/Other Charges (see QuotationItemEntry).
  const [otherChargesAmount, setOtherChargesAmount] = useState(0);
  // Quotation-specific document-level tax -- deliberately separate from GST, which Quotations
  // still never carry (every line's own gstPct is forced to 0 on save, exactly as before).
  const [taxPct, setTaxPct] = useState(0);
  const [termsConditions, setTermsConditions] = useState("");
  const [notes, setNotes] = useState("");
  // Drives the "2. Add Item" header button -- the actual Add/Update action still lives inside
  // QuotationItemEntry (it owns the in-progress item), triggered here via ref per the mockup's
  // top-right button placement. isEditingItem only controls that button's label.
  const itemEntryRef = useRef<QuotationItemEntryHandle>(null);
  const [isEditingItem, setIsEditingItem] = useState(false);

  // Restored from a draft when returning from "+ Add New Product…" -- seeds QuotationItemEntry's
  // own in-progress item via its initialItem/initialEditingKey props (see the restore effect
  // below). Cleared once consumed so a later remount of the form starts blank again.
  const [restoredItem, setRestoredItem] = useState<SalesLine | undefined>(undefined);
  const [restoredEditingKey, setRestoredEditingKey] = useState<string | null>(null);
  // Names a product created via "+ Add New Product…" that hasn't shown up in `products` yet --
  // handed to QuotationItemEntry, which drops it into the in-progress item once the cache catches
  // up (see its own pendingProductId prop).
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);

  // Coming back from Product Master after "+ Add New Product…", or from Customer Entry after
  // "New Customer": restore the form exactly as it was. Customer's own list is refetched by the
  // time we land back here (CustomersPage's create already resolved before navigating), so no
  // wait-for-cache step is needed for it -- only the product needs one, since QuotationItemEntry
  // itself owns that effect now (see pendingProductId above).
  useEffect(() => {
    const state = location.state as { restoreDraft?: QuotationDraft; newProductId?: number; newCustomerId?: number } | null;
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
    setTermsConditions(draft.termsConditions);
    setNotes(draft.notes);
    setOtherChargesAmount(draft.otherChargesAmount);
    setTaxPct(draft.taxPct);
    setRestoredItem(draft.pendingItem);
    setRestoredEditingKey(draft.pendingEditingKey ?? null);
    if (state.newProductId) setPendingProductId(state.newProductId);
    setShowForm(true);
    // Consume the navigation state so refreshing or navigating back doesn't replay this restore.
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "+ Add New Product…" picked in the item entry form: stash everything (including the item
   * still being typed) and navigate to Product Master. Saving a product there returns here (see
   * the restore effect above) with the same data restored and the new product selected into the
   * same in-progress item. Navigating to Product Master any other way (the main menu) never
   * carries this state, so it behaves exactly as it always has -- no redirect back here. */
  function handleAddNewProduct(currentItem: SalesLine) {
    const draft: QuotationDraft = {
      editingId, customerId, lines, pendingItem: currentItem,
      holeRate, bHoleRate, cutoutRate, bCutoutRate, roundOffEnabled, discountType, discountValue,
      termsConditions, notes, otherChargesAmount, taxPct,
    };
    navigate("/masters/products", { state: { returnTo: "quotation", draft } });
  }

  /** "New Customer": stash everything typed so far and navigate to the real Customer Entry page
   * (CustomersPage.tsx) -- same round trip as handleAddNewProduct above, just without a per-item
   * target since a quotation only ever has one customer. Saving there returns here (see the
   * restore effect above) with the same data restored and the new customer selected. */
  function handleAddNewCustomer() {
    const draft: QuotationDraft = {
      editingId, customerId, lines,
      holeRate, bHoleRate, cutoutRate, bCutoutRate, roundOffEnabled, discountType, discountValue,
      termsConditions, notes, otherChargesAmount, taxPct,
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
    setEditingHeader(null);
    setLines([]);
    setCustomerId("");
    setHoleRate(0);
    setBHoleRate(0);
    setCutoutRate(0);
    setBCutoutRate(0);
    setRoundOffEnabled(true);
    setDiscountType("Percent");
    setDiscountValue(0);
    setOtherChargesAmount(0);
    setTaxPct(0);
    setTermsConditions("");
    setNotes("");
    setRestoredItem(undefined);
    setRestoredEditingKey(null);
    setPendingProductId(null);
  }

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  async function openEditForm(q: QuotationDto) {
    const full = await fetchQuotation(q.quotationId).unwrap();
    setEditingId(full.quotationId);
    setEditingHeader({ quotationNo: full.quotationNo ?? "", quotationDate: full.quotationDate ?? new Date().toISOString() });
    setCustomerId(full.customerId);
    setLines(full.lines.map(fromSavedLine));
    setHoleRate(full.holeRate);
    setBHoleRate(full.bHoleRate);
    setCutoutRate(full.cutoutRate);
    setBCutoutRate(full.bCutoutRate);
    setRoundOffEnabled(full.roundOffEnabled);
    setDiscountType(full.discountType);
    setDiscountValue(full.discountValue);
    setTermsConditions(full.termsConditions ?? "");
    setNotes(full.notes ?? "");
    setOtherChargesAmount(full.otherChargesAmount ?? 0);
    setTaxPct(full.taxPct ?? 0);
    setRestoredItem(undefined);
    setRestoredEditingKey(null);
    setPendingProductId(null);
    setShowForm(true);
  }

  // ---------- Live summary (mirrors what the server will compute on save) ----------
  const validLines = lines.filter(isComplete);
  const linesTotal = validLines.reduce((s, l) => s + calcLine(l, false, true).basicAmount, 0);
  const totalHoleQty = lines.reduce((s, l) => s + (l.holeQty || 0), 0);
  const totalBHoleQty = lines.reduce((s, l) => s + (l.bHoleQty || 0), 0);
  const totalCutoutQty = lines.reduce((s, l) => s + (l.cutoutQty || 0), 0);
  const totalBCutoutQty = lines.reduce((s, l) => s + (l.bCutoutQty || 0), 0);
  const holesCutoutAmount = totalHoleQty * holeRate + totalBHoleQty * bHoleRate + totalCutoutQty * cutoutRate + totalBCutoutQty * bCutoutRate;
  const subtotal = linesTotal + holesCutoutAmount;
  const discountAmount = discountType === "Percent" ? (subtotal * discountValue) / 100 : discountValue;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const afterOtherCharges = afterDiscount + otherChargesAmount;
  const taxAmount = (afterOtherCharges * taxPct) / 100;
  const grandTotalRaw = afterOtherCharges + taxAmount;
  const grandTotal = roundOffEnabled ? Math.round(grandTotalRaw) : Math.round(grandTotalRaw * 100) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      alertError("Customer required", "Select a customer, or add a new one.");
      return;
    }

    if (validLines.length === 0) {
      alertError(
        "No priceable items",
        "Please add at least one item to the quotation.",
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
    if (taxPct < 0 || taxPct > 100) {
      alertError("Invalid tax", "Tax % must be between 0 and 100.");
      return;
    }
    if (otherChargesAmount < 0) {
      alertError("Invalid charge", "Other Charges cannot be negative.");
      return;
    }

    // Stock is not checked here — a quotation is allowed to save even when it's short on stock
    // (the live per-row badge on each line is still shown, purely advisory).

    try {
      // Quotations don't carry GST, and discount is document-level now, not per line -- every
      // line is sent with gstPct/discountPct forced to 0 regardless of whatever value it happens
      // to hold (e.g. a legacy quotation loaded for edit).
      const payload: CreateQuotationLine[] = validLines.map(toCreateLine).map((l) => ({ ...l, gstPct: 0, discountPct: 0 }));
      if (editingId) {
        await updateQuotation({
          id: editingId,
          body: {
            customerId: Number(customerId), lines: payload, holeRate, bHoleRate, cutoutRate, bCutoutRate,
            roundOffEnabled, discountType, discountValue, termsConditions, notes, otherChargesAmount, taxPct,
          },
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
          termsConditions,
          notes,
          otherChargesAmount,
          taxPct,
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
        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
          {/* ---------- 1. Customer & Quotation Details ---------- */}
          <Section title="1. Customer & Quotation Details" extra={loadingForEdit ? <span className="text-xs text-slate-400">Loading…</span> : undefined}>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="w-full max-w-sm">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")} className={inputClass}>
                  <option value="">Select customer…</option>
                  {customers?.items.map((c) => (
                    <option key={c.customerId} value={c.customerId}>{c.name} ({c.customerType ?? "Retail"})</option>
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
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Quotation No.</label>
                <input value={editingHeader?.quotationNo || "Auto-generated on save"} disabled className={`${inputClass} bg-slate-50 text-slate-400`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Quotation Date</label>
                {/* Server-assigned at save time, as it always has been -- shown read-only rather than
                    made editable, since letting the operator pick it would be a behaviour change. */}
                <input value={new Date(editingHeader?.quotationDate ?? Date.now()).toLocaleDateString("en-IN")} disabled className={`${inputClass} bg-slate-50 text-slate-400`} />
              </div>
            </div>
          </Section>

          {/* ---------- 2. Add Item ---------- */}
          <Section
            title="2. Add Item"
            extra={
              <button
                type="button"
                onClick={() => itemEntryRef.current?.addItem()}
                className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition"
              >
                <Plus size={14} /> {isEditingItem ? "Update Item" : "Add Item"}
              </button>
            }
          >
            <QuotationItemEntry
              ref={itemEntryRef}
              lines={lines}
              onChange={setLines}
              products={products}
              onAddNewProduct={handleAddNewProduct}
              initialItem={restoredItem}
              initialEditingKey={restoredEditingKey}
              pendingProductId={pendingProductId}
              onPendingProductConsumed={() => setPendingProductId(null)}
              docRates={{ holeRate, bHoleRate, cutoutRate, bCutoutRate }}
              onDocRateChange={(field, value) => {
                if (field === "holeRate") setHoleRate(value);
                else if (field === "bHoleRate") setBHoleRate(value);
                else if (field === "cutoutRate") setCutoutRate(value);
                else setBCutoutRate(value);
              }}
              onEditingChange={setIsEditingItem}
            />
          </Section>

          <div className="grid lg:grid-cols-3 gap-5 items-start">
            {/* ---------- 3. Charges & Discount ---------- */}
            <Section title="3. Charges & Discount">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discount Type</label>
                  <select value={discountType} onChange={(e) => setDiscountType(e.target.value as QuotationDiscountType)} className={inputClass}>
                    <option value="Percent">%</option>
                    <option value="Amount">₹</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discount Value</label>
                  <input type="number" min={0} max={discountType === "Percent" ? 100 : undefined} step="0.01" value={discountValue || ""} onChange={(e) => setDiscountValue(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discount Amount</label>
                  <input disabled value={money(discountAmount)} className={`${inputClass} bg-slate-100 text-slate-500`} />
                </div>
                <label className="flex items-center gap-1.5 text-sm text-slate-600 self-end pb-2.5">
                  <input type="checkbox" checked={roundOffEnabled} onChange={(e) => setRoundOffEnabled(e.target.checked)} className="rounded border-slate-300" />
                  Round Off
                </label>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Other Charges (+)</label>
                  <input type="number" min={0} step="0.01" value={otherChargesAmount || ""} onChange={(e) => setOtherChargesAmount(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tax (%)</label>
                  <input type="number" min={0} max={100} step="0.01" value={taxPct || ""} onChange={(e) => setTaxPct(Number(e.target.value))} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tax Amount</label>
                  <input disabled value={money(taxAmount)} className={`${inputClass} bg-slate-100 text-slate-500`} />
                </div>
              </div>
            </Section>

            {/* ---------- 4. Terms & Notes ---------- */}
            <Section title="4. Terms & Notes">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Terms & Conditions</label>
                  <textarea rows={3} value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} placeholder="Enter terms and conditions…" className={`${inputClass} resize-y`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter any additional notes…" className={`${inputClass} resize-y`} />
                </div>
              </div>
            </Section>

            {/* ---------- 5. Summary ---------- */}
            <Section title="5. Summary">
              <div className="space-y-1.5 text-sm">
                <SummaryRow label="Basic Amount" value={money(subtotal)} />
                <SummaryRow label="Discount Amount" value={`− ${money(discountAmount)}`} />
                <SummaryRow label="Other Charges" value={money(otherChargesAmount)} />
                <SummaryRow label="Tax Amount" value={money(taxAmount)} />
                {roundOffEnabled && Math.abs(grandTotal - grandTotalRaw) > 0.001 && (
                  <SummaryRow label="Round Off" value={`${grandTotal - grandTotalRaw >= 0 ? "+" : "−"} ${money(Math.abs(grandTotal - grandTotalRaw))}`} />
                )}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200">
                  <span className="text-base font-bold text-brand-900">Grand Total</span>
                  <span className="text-base font-bold text-brand-900">{money(grandTotal)}</span>
                </div>
              </div>
            </Section>
          </div>

          <div className="flex justify-end gap-2">
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

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-brand-800">{title}</h2>
        {extra}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
