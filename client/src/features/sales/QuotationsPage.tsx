import { useState } from "react";
import { Link } from "react-router-dom";
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
  getLineStockShortage,
} from "./SalesLineGrid";
import type { SalesLine } from "./SalesLineGrid";
import { useStockSummaryQuery } from "../reports/reportsApi";
import { alertError } from "../../lib/alerts";
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
  CustomerType,
  NewCustomerRequest,
  CreateQuotationLine,
  QuotationDto,
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

const emptyNewCustomer: NewCustomerRequest = {
  name: "",
  customerType: "Retail",
  gstin: "",
  mobile: "",
  billingAddress: "",
  stateCode: "19",
  stateName: "West Bengal",
};

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

export default function QuotationsPage() {
  const { data, isLoading } = useListQuotationsQuery();
  const { data: customers } = useListCustomersQuery();
  const { data: products } = useListProductsQuery();
  const { data: stockSummary } = useStockSummaryQuery();
  const [createQuotation, { isLoading: saving }] = useCreateQuotationMutation();
  const [updateQuotation, { isLoading: updating }] = useUpdateQuotationMutation();
  const [deleteQuotation] = useDeleteQuotationMutation();
  const [createSalesOrder, { isLoading: converting }] =
    useCreateSalesOrderMutation();
  const [fetchQuotation, { isFetching: loadingForEdit }] = useLazyGetQuotationQuery();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] =
    useState<NewCustomerRequest>(emptyNewCustomer);
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);

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
    setNewCustomerMode(false);
    setNewCustomer(emptyNewCustomer);
  }

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  async function openEditForm(q: QuotationDto) {
    const full = await fetchQuotation(q.quotationId).unwrap();
    setEditingId(full.quotationId);
    setCustomerId(full.customerId);
    setNewCustomerMode(false);
    setLines(full.lines.length ? full.lines.map(fromSavedLine) : [emptyLine()]);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId && newCustomerMode) {
      if (!newCustomer.name.trim()) {
        alertError("Customer name required", "Enter the new customer name.");
        return;
      }
      if (!newCustomer.mobile?.trim()) {
        alertError("Phone number required", "A phone number is mandatory for every customer.");
        return;
      }
    } else if (!customerId) {
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
    const badGst = valid.find((l) => l.gstPct < 0 || l.gstPct > 100);
    if (badGst) {
      alertError("Invalid GST %", "GST % must be between 0 and 100.");
      return;
    }
    const badDisc = valid.find((l) => l.discountPct < 0 || l.discountPct > 100);
    if (badDisc) {
      alertError("Invalid discount %", "Discount % must be between 0 and 100.");
      return;
    }

    // Stock is checked once more, authoritatively, right before saving — the live per-row badge
    // is only advisory while the operator is still typing; a quotation that is short on stock
    // must not be allowed to save at all.
    const freeStockByProduct = new Map<number, number>();
    for (const r of stockSummary?.items ?? []) freeStockByProduct.set(r.productId, r.qtyFree);
    const shortageLines: string[] = [];
    for (const l of valid) {
      const product = products?.items.find((p) => p.productId === l.productId);
      const shortage = getLineStockShortage(l, product, freeStockByProduct.get(l.productId) ?? 0);
      if (shortage && shortage.short > 0.0001) {
        shortageLines.push(`${product?.code ?? "Item"}: short ${shortage.short.toFixed(2)} ${shortage.unit}`);
      }
    }
    if (shortageLines.length > 0) {
      alertError("Stock is short", `This quotation cannot be saved — stock is short for:\n${shortageLines.join("\n")}`);
      return;
    }

    try {
      const payload: CreateQuotationLine[] = valid.map(toCreateLine);
      if (editingId) {
        await updateQuotation({
          id: editingId,
          body: { customerId: Number(customerId), lines: payload },
        }).unwrap();
      } else {
        await createQuotation({
          customerId: newCustomerMode ? 0 : Number(customerId),
          newCustomer: newCustomerMode ? newCustomer : undefined,
          lines: payload,
        }).unwrap();
      }
      setShowForm(false);
      resetForm();
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
      // Carry the whole line across — size, unit, rate basis, thickness, GST, discount and any
      // override — so the order prices to the same figure as the quotation it came from.
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
          <div className="flex flex-wrap items-end gap-3">
            {!newCustomerMode ? (
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
            ) : (
              <div className="text-sm font-semibold text-brand-800">
                New customer details
              </div>
            )}
            {/* Inline new-customer creation only applies to a brand-new quotation. */}
            {!editingId && (
              <button
                type="button"
                onClick={() => setNewCustomerMode((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 pb-2.5"
              >
                {newCustomerMode ? (
                  <>
                    <X size={15} /> Use existing customer
                  </>
                ) : (
                  <>
                    <UserPlus size={15} /> New customer
                  </>
                )}
              </button>
            )}
          </div>

          {newCustomerMode && (
            <div className="grid sm:grid-cols-3 gap-4 rounded-lg bg-slate-50 border border-slate-200 p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Name *
                </label>
                <input
                  required
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer((c) => ({ ...c, name: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Customer Type *
                </label>
                <select
                  value={newCustomer.customerType}
                  onChange={(e) =>
                    setNewCustomer((c) => ({
                      ...c,
                      customerType: e.target.value as CustomerType,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Phone Number *
                </label>
                <input
                  required
                  value={newCustomer.mobile ?? ""}
                  onChange={(e) =>
                    setNewCustomer((c) => ({ ...c, mobile: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="10-digit mobile number"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  GSTIN
                </label>
                <input
                  maxLength={15}
                  value={newCustomer.gstin ?? ""}
                  onChange={(e) =>
                    setNewCustomer((c) => ({ ...c, gstin: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Billing Address
                </label>
                <input
                  value={newCustomer.billingAddress ?? ""}
                  onChange={(e) =>
                    setNewCustomer((c) => ({
                      ...c,
                      billingAddress: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <p className="sm:col-span-3 text-xs text-slate-500">
                This customer is saved to Master Data when the quotation is
                saved.
              </p>
            </div>
          )}

          {/* ---------- Lines ---------- */}
          {/* Shared with the Sales Order screen so the two can never drift apart. */}
          <SalesLineGrid lines={lines} products={products} onChange={setLines} />

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
