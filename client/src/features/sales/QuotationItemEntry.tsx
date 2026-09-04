import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw, Trash } from "lucide-react";
import { emptyLine, isComplete, calcLine, PRESETS, type SalesLine } from "./SalesLineGrid";
import { DIMENSION_UNITS, RATE_UNITS, RATE_UNIT_LABEL } from "../../lib/quotationCalc";
import { parseGlassDimension } from "../../lib/glassDimension";
import { useListCategoriesQuery, useListSubCategoriesQuery, useListActiveTypesQuery } from "../masters/mastersApi";
import { alertError, confirmAction } from "../../lib/alerts";
import type { ProductDto } from "../../lib/types";

/**
 * The redesigned Quotation Entry item form -- a single in-progress item ("2. Add Item") plus the
 * read-only "Added Items" list below it, matching the user-supplied mockup. This replaces
 * SalesLineGrid's always-editable-grid-of-every-line UI for Quotations only; Sales Order keeps
 * using SalesLineGrid exactly as before (this file is Quotation-specific and never imported by
 * SalesOrdersPage.tsx). All pricing math is unchanged -- this file only ever calls the same
 * calcLine/isComplete/emptyLine helpers SalesLineGrid itself uses, so the two documents are still
 * priced by exactly one engine.
 */

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition";
const labelClass = "block text-xs font-semibold text-slate-600 mb-1";
const overriddenClass =
  "w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-300 transition";

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}
function num(n: number, dp = 2) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

interface Props {
  lines: SalesLine[];
  onChange: (lines: SalesLine[]) => void;
  products?: { items: ProductDto[] };
  /** Same "+ Add New Product…" round trip Product Master already offers elsewhere. */
  onAddNewProduct?: (currentItem: SalesLine) => void;
  /** Seeds the in-progress item on mount -- used to restore the exact item being entered when the
   * operator left for "+ Add New Product…", since this component otherwise starts every mount
   * from a blank item (see QuotationsPage's restore effect, which remounts this component fresh
   * after the round trip). */
  initialItem?: SalesLine;
  initialEditingKey?: string | null;
  /** A product created via "+ Add New Product…" that hasn't shown up in `products` yet (its cache
   * is invalidated by the create, but the refetch is async) -- once it does, it's dropped into the
   * in-progress item exactly like picking it from the dropdown would (rate/thickness prefilled).
   * onPendingProductConsumed lets the parent stop carrying it once that's happened. */
  pendingProductId?: number | null;
  onPendingProductConsumed?: () => void;
  /** Hole/cut-out rates. These are document-level on the quotation -- one shared rate priced
   * against every item's own quantities, which is existing behaviour left untouched -- but the
   * mockup shows them beside the quantities they price, so they're rendered here and written
   * straight back to the parent's state. */
  docRates?: DocRates;
  onDocRateChange?: (field: keyof DocRates, value: number) => void;
}

export interface DocRates {
  holeRate: number;
  bHoleRate: number;
  cutoutRate: number;
  bCutoutRate: number;
}

export default function QuotationItemEntry({ lines, onChange, products, onAddNewProduct, initialItem, initialEditingKey, pendingProductId, onPendingProductConsumed, docRates, onDocRateChange }: Props) {
  const [item, setItem] = useState<SalesLine>(() => initialItem ?? { ...emptyLine("CUT_SQFT"), itemType: "CUTTING" });
  const [editingKey, setEditingKey] = useState<string | null>(initialEditingKey ?? null);

  // Once the newly created product actually shows up in the product list, select it into the
  // in-progress item the same way picking it from the dropdown would.
  useEffect(() => {
    if (!pendingProductId || !products) return;
    const product = products.items.find((p) => p.productId === pendingProductId);
    if (!product) return;
    setItem((it) => ({ ...it, productId: product.productId, rate: product.sellingRate ?? it.rate, thicknessMm: product.thicknessMm ?? it.thicknessMm }));
    onPendingProductConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProductId, products]);

  // Category/Sub-Category/Type -- database-driven, narrowing the Product dropdown below (see
  // productOptionsFor). Fetched once here, same pattern as SalesLineGrid's own per-line filters.
  const { data: categories } = useListCategoriesQuery();
  const { data: allSubCategories } = useListSubCategoriesQuery();
  const { data: activeTypes } = useListActiveTypesQuery();

  function set<K extends keyof SalesLine>(key: K, value: SalesLine[K]) {
    setItem((it) => ({ ...it, [key]: value }));
  }

  function subCategoryOptionsFor(categoryFilter: number | "") {
    if (!categoryFilter) return allSubCategories?.items ?? [];
    return (allSubCategories?.items ?? []).filter((sc) => sc.categoryId === categoryFilter);
  }
  function productOptionsFor(it: SalesLine) {
    const all = products?.items ?? [];
    return all.filter(
      (p) =>
        (!it.categoryFilter || p.categoryId === it.categoryFilter) &&
        (!it.subCategoryFilter || p.subCategoryId === it.subCategoryFilter) &&
        (!it.typeFilter || p.typeId === it.typeFilter),
    );
  }

  function onProductChange(productId: number) {
    if (!productId) { set("productId", 0); return; }
    const product = products?.items.find((p) => p.productId === productId);
    setItem((it) => ({ ...it, productId, rate: product?.sellingRate ?? it.rate, thicknessMm: product?.thicknessMm ?? it.thicknessMm }));
  }

  function selectTab(next: "CUTTING" | "TOUGHENED") {
    setItem((it) => ({
      ...it,
      itemType: next,
      ...(next === "CUTTING"
        ? PRESETS.CUT_SQFT
        : { rateUnit: "PER_SQFT" as const, dimensionUnit: "INCH" as const, applyThickness: false, chargeRoundingInch: 6 }),
    }));
  }

  function resetItem() {
    setItem({ ...emptyLine("CUT_SQFT"), itemType: item.itemType });
    setEditingKey(null);
  }

  function handleAddItem() {
    if (!item.productId) {
      void alertError("Product required", "Please select a Product.");
      return;
    }
    if (!isComplete(item)) {
      void alertError(
        "Incomplete item",
        item.rateUnit === "PER_PIECE" ? "Please enter a valid Rate." : "Please enter a valid size, quantity and rate.",
      );
      return;
    }
    if (editingKey) {
      onChange(lines.map((l) => (l.key === editingKey ? { ...item, key: editingKey } : l)));
    } else {
      onChange([...lines, { ...item, key: crypto.randomUUID() }]);
    }
    resetItem();
  }

  function handleEdit(l: SalesLine) {
    setItem(l);
    setEditingKey(l.key);
  }

  async function handleDelete(key: string) {
    const confirmed = await confirmAction("Remove this item?", "This item will be removed from the quotation.", "Yes, remove");
    if (!confirmed) return;
    onChange(lines.filter((l) => l.key !== key));
    if (editingKey === key) resetItem();
  }

  async function handleClearAll() {
    if (lines.length === 0) return;
    const confirmed = await confirmAction("Clear all items?", "Every item added to this quotation will be removed.", "Yes, clear all");
    if (!confirmed) return;
    onChange([]);
    resetItem();
  }

  const c = calcLine(item, false, true);
  const productOptions = productOptionsFor(item);

  return (
    <div className="space-y-4">
      {/* ---------- Category / Sub-Category / Type / Product / Thickness / Process ---------- */}
      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className={labelClass}>Category *</label>
          <select
            value={item.categoryFilter}
            onChange={(e) => setItem((it) => ({ ...it, categoryFilter: e.target.value ? Number(e.target.value) : "", subCategoryFilter: "" }))}
            className={inputClass}
          >
            <option value="">Select category…</option>
            {categories?.items.map((cg) => (
              <option key={cg.categoryId} value={cg.categoryId}>{cg.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Sub Category *</label>
          <select
            value={item.subCategoryFilter}
            onChange={(e) => set("subCategoryFilter", e.target.value ? Number(e.target.value) : "")}
            className={inputClass}
          >
            <option value="">Select sub category…</option>
            {subCategoryOptionsFor(item.categoryFilter).map((sc) => (
              <option key={sc.subCategoryId} value={sc.subCategoryId}>{sc.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Type *</label>
          <select value={item.typeFilter} onChange={(e) => set("typeFilter", e.target.value ? Number(e.target.value) : "")} className={inputClass}>
            <option value="">Select type…</option>
            {activeTypes?.items.map((t) => (
              <option key={t.typeId} value={t.typeId}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Product *</label>
          <select
            value={item.productId || ""}
            onChange={(e) => {
              if (e.target.value === "__new__") { onAddNewProduct?.(item); return; }
              onProductChange(Number(e.target.value));
            }}
            className={inputClass}
          >
            <option value="">Select product…</option>
            {productOptions.map((p) => (
              <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>
            ))}
            {onAddNewProduct && <option value="__new__">+ Add New Product…</option>}
          </select>
          {(item.categoryFilter || item.subCategoryFilter || item.typeFilter) && productOptions.length === 0 && (
            <div className="mt-1 text-[11px] text-amber-600">No products match this filter.</div>
          )}
        </div>
        <div>
          <label className={labelClass}>Thickness (mm)</label>
          <input type="number" min={0} step="0.1" placeholder="Thickness" value={item.thicknessMm || ""} onChange={(e) => set("thicknessMm", Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Calculation Process (For Toughened)</label>
          <select
            value={item.chargeRoundingInch}
            disabled={item.itemType !== "TOUGHENED"}
            onChange={(e) => set("chargeRoundingInch", Number(e.target.value))}
            className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
          >
            <option value={0}>Flat</option>
            <option value={3}>3&quot;</option>
            <option value={6}>6&quot;</option>
          </select>
        </div>
      </div>

      {/* ---------- Cutting / Toughened tabs ---------- */}
      <div className="border-b border-slate-200 flex gap-6">
        {(["CUTTING", "TOUGHENED"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={`pb-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              item.itemType === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {/* Display labels only -- per the user's rename request the CUTTING tab now reads
                "Sheet" and the TOUGHENED tab reads "Cutting". The underlying itemType values
                ("CUTTING"/"TOUGHENED") are unchanged so PRESETS/calcLine/isComplete etc. keep
                working exactly as before. */}
            {t === "CUTTING" ? "Sheet" : "Cutting"}
          </button>
        ))}
      </div>

      {item.itemType === "CUTTING" ? (
        <div className="grid sm:grid-cols-3 lg:grid-cols-9 gap-3 items-end">
          <Field label="Length *">
            <input
              placeholder="Length"
              value={item.lengthText}
              onChange={(e) => {
                const lengthText = e.target.value;
                const parsed = parseGlassDimension(lengthText);
                if (parsed !== null) setItem((it) => ({ ...it, lengthText, length: parsed }));
                else if (lengthText === "") setItem((it) => ({ ...it, lengthText, length: 0 }));
                else setItem((it) => ({ ...it, lengthText }));
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Width *">
            <input
              placeholder="Width"
              value={item.widthText}
              onChange={(e) => {
                const widthText = e.target.value;
                const parsed = parseGlassDimension(widthText);
                if (parsed !== null) setItem((it) => ({ ...it, widthText, width: parsed }));
                else if (widthText === "") setItem((it) => ({ ...it, widthText, width: 0 }));
                else setItem((it) => ({ ...it, widthText }));
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Selection">
            <input value={item.selection} onChange={(e) => set("selection", e.target.value)} className={inputClass} placeholder="Optional" />
          </Field>
          <Field label="Unit">
            <select value={item.dimensionUnit} onChange={(e) => set("dimensionUnit", e.target.value as SalesLine["dimensionUnit"])} className={inputClass}>
              {DIMENSION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Qty *">
            <input type="number" min={0} step="0.01" value={item.qty || ""} onChange={(e) => set("qty", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Area">
            <input disabled value={`${num(c.calculatedArea, 4)} ${c.areaUnit}`} className={`${inputClass} bg-slate-100 text-slate-500`} />
          </Field>
          <Field label="Rate *">
            <input type="number" min={0} step="0.01" value={item.rate || ""} onChange={(e) => set("rate", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Rate Unit">
            <select value={item.rateUnit} onChange={(e) => set("rateUnit", e.target.value as SalesLine["rateUnit"])} className={inputClass}>
              {RATE_UNITS.map((u) => <option key={u} value={u}>{RATE_UNIT_LABEL[u]}</option>)}
            </select>
          </Field>
          <Field label="Basic Amount">
            <input disabled value={money(c.calculatedBasicAmount)} className={`${inputClass} bg-slate-100 text-slate-500`} />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 rounded-lg border border-slate-200 p-3">
            <h3 className="sm:col-span-2 lg:col-span-6 text-xs font-bold uppercase tracking-wide text-slate-500 -mb-1">Dimensions</h3>
            <Field label="Actual Height *">
              <input
                placeholder="Height"
                value={item.lengthText}
                onChange={(e) => {
                  const lengthText = e.target.value;
                  const parsed = parseGlassDimension(lengthText);
                  if (parsed !== null) setItem((it) => ({ ...it, lengthText, length: parsed }));
                  else if (lengthText === "") setItem((it) => ({ ...it, lengthText, length: 0 }));
                  else setItem((it) => ({ ...it, lengthText }));
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Actual Width *">
              <input
                placeholder="Width"
                value={item.widthText}
                onChange={(e) => {
                  const widthText = e.target.value;
                  const parsed = parseGlassDimension(widthText);
                  if (parsed !== null) setItem((it) => ({ ...it, widthText, width: parsed }));
                  else if (widthText === "") setItem((it) => ({ ...it, widthText, width: 0 }));
                  else setItem((it) => ({ ...it, widthText }));
                }}
                className={inputClass}
              />
            </Field>
            {/* Chargeable Height/Width -- auto-suggested (rounded per the Calculation Process
                above), but always overridable per the mockup and the spec's own requirement (a
                Quotation like the reference workbook shows real jobs mixing rounding rules within
                the same row -- see QuotationCalculator.RoundUpToStep and its own doc comment). */}
            <Field label="Chargeable Height *">
              <input
                type="number" min={0} step="0.01"
                value={item.manualChargeHeightInch ?? Number(c.chargeLengthInch.toFixed(2))}
                onChange={(e) => set("manualChargeHeightInch", e.target.value === "" ? null : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className={item.manualChargeHeightInch != null ? overriddenClass : inputClass}
              />
              {item.manualChargeHeightInch != null && (
                <button type="button" onClick={() => set("manualChargeHeightInch", null)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-amber-700 hover:text-amber-900 font-medium">
                  <RotateCcw size={10} /> reset
                </button>
              )}
            </Field>
            <Field label="Chargeable Width *">
              <input
                type="number" min={0} step="0.01"
                value={item.manualChargeWidthInch ?? Number(c.chargeWidthInch.toFixed(2))}
                onChange={(e) => set("manualChargeWidthInch", e.target.value === "" ? null : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className={item.manualChargeWidthInch != null ? overriddenClass : inputClass}
              />
              {item.manualChargeWidthInch != null && (
                <button type="button" onClick={() => set("manualChargeWidthInch", null)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-amber-700 hover:text-amber-900 font-medium">
                  <RotateCcw size={10} /> reset
                </button>
              )}
            </Field>
            <Field label="Unit">
              <select value={item.dimensionUnit} onChange={(e) => set("dimensionUnit", e.target.value as SalesLine["dimensionUnit"])} className={inputClass}>
                {DIMENSION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Qty (PCS) *">
              <input type="number" min={0} step="1" value={item.qty || ""} onChange={(e) => set("qty", Number(e.target.value))} className={inputClass} />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3">
            <h3 className="sm:col-span-2 lg:col-span-4 text-xs font-bold uppercase tracking-wide text-slate-500 -mb-1">Holes &amp; Cut Outs</h3>
            <Field label="Hole Qty"><input type="number" min={0} step="1" value={item.holeQty || ""} onChange={(e) => set("holeQty", Number(e.target.value))} className={inputClass} /></Field>
            <Field label="Big-Hole"><input type="number" min={0} step="1" value={item.bHoleQty || ""} onChange={(e) => set("bHoleQty", Number(e.target.value))} className={inputClass} /></Field>
            <Field label="CutOut"><input type="number" min={0} step="1" value={item.cutoutQty || ""} onChange={(e) => set("cutoutQty", Number(e.target.value))} className={inputClass} /></Field>
            <Field label="Big-Cutout"><input type="number" min={0} step="1" value={item.bCutoutQty || ""} onChange={(e) => set("bCutoutQty", Number(e.target.value))} className={inputClass} /></Field>
          </div>

          {docRates && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3">
              <h3 className="sm:col-span-2 lg:col-span-4 text-xs font-bold uppercase tracking-wide text-slate-500 -mb-1">
                Rates (₹) — shared across the whole quotation, not per item
              </h3>
              <Field label="Hole Rate"><input type="number" min={0} step="0.01" value={docRates.holeRate || ""} onChange={(e) => onDocRateChange?.("holeRate", Number(e.target.value))} className={inputClass} /></Field>
              <Field label="Big Hole Rate"><input type="number" min={0} step="0.01" value={docRates.bHoleRate || ""} onChange={(e) => onDocRateChange?.("bHoleRate", Number(e.target.value))} className={inputClass} /></Field>
              <Field label="CutOut Rate"><input type="number" min={0} step="0.01" value={docRates.cutoutRate || ""} onChange={(e) => onDocRateChange?.("cutoutRate", Number(e.target.value))} className={inputClass} /></Field>
              <Field label="Big CutOut Rate"><input type="number" min={0} step="0.01" value={docRates.bCutoutRate || ""} onChange={(e) => onDocRateChange?.("bCutoutRate", Number(e.target.value))} className={inputClass} /></Field>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3">
            <h3 className="sm:col-span-2 lg:col-span-4 text-xs font-bold uppercase tracking-wide text-slate-500 -mb-1">
              Amounts (₹) — this item's own contribution. Hole/cut-out amounts are shown for reference; they are added
              to the quotation total from the shared rates above, not to this item's Basic Amount.
            </h3>
            <Field label="Glass Amount"><input disabled value={num(c.glassAmount, 2)} className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
            <Field label="Hardware (₹)"><input type="number" min={0} step="0.01" value={item.hardwareAmount || ""} onChange={(e) => set("hardwareAmount", Number(e.target.value))} className={inputClass} /></Field>
            <Field label="Transport (₹)"><input type="number" min={0} step="0.01" value={item.transportAmount || ""} onChange={(e) => set("transportAmount", Number(e.target.value))} className={inputClass} /></Field>
            <Field label="Other Charges (₹)"><input type="number" min={0} step="0.01" value={item.otherChargesAmount || ""} onChange={(e) => set("otherChargesAmount", Number(e.target.value))} className={inputClass} /></Field>
            {docRates && (
              <>
                <Field label="Hole Amount"><input disabled value={num(item.holeQty * docRates.holeRate, 2)} className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
                <Field label="Big Hole Amount"><input disabled value={num(item.bHoleQty * docRates.bHoleRate, 2)} className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
                <Field label="CutOut Amount"><input disabled value={num(item.cutoutQty * docRates.cutoutRate, 2)} className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
                <Field label="Big CutOut Amount"><input disabled value={num(item.bCutoutQty * docRates.bCutoutRate, 2)} className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Rate Unit *">
              <select value={item.rateUnit} onChange={(e) => set("rateUnit", e.target.value as SalesLine["rateUnit"])} className={inputClass}>
                {RATE_UNITS.map((u) => <option key={u} value={u}>{RATE_UNIT_LABEL[u]}</option>)}
              </select>
            </Field>
            <Field label="Rate (₹) *">
              <input type="number" min={0} step="0.01" value={item.rate || ""} onChange={(e) => set("rate", Number(e.target.value))} className={inputClass} />
              {item.applyThickness && <div className="mt-0.5 text-[10px] text-slate-400">eff. {num(c.effectiveRate, 2)}</div>}
            </Field>
            <Field label="Basic Amount">
              <input disabled value={money(c.calculatedBasicAmount)} className={`${inputClass} bg-slate-100 text-slate-500`} />
            </Field>
          </div>
        </div>
      )}

      <Field label="Description">
        <textarea rows={2} placeholder="Enter description / remarks…" value={item.description} onChange={(e) => set("description", e.target.value)} className={`${inputClass} resize-y`} />
      </Field>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow transition"
        >
          <Plus size={16} /> {editingKey ? "Update Item" : "Add Item"}
        </button>
      </div>

      {/* ---------- Added Items ---------- */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Sub Category</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Product / Description</th>
              <th className="px-3 py-2 font-medium">Thickness (mm)</th>
              <th className="px-3 py-2 font-medium">Chargeable Size (H x W)</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium">Rate Unit</th>
              <th className="px-3 py-2 font-medium text-right">Rate (₹)</th>
              <th className="px-3 py-2 font-medium text-right">Basic Amount (₹)</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-slate-400">
                  No items added yet.<br />Add items using the form above.
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const lc = calcLine(l, false, true);
              const product = products?.items.find((p) => p.productId === l.productId);
              return (
                <tr key={l.key} className={editingKey === l.key ? "bg-brand-50/60" : ""}>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 text-slate-600">{product?.categoryName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{product?.subCategoryName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{product?.typeName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {product ? `${product.code} — ${product.description}` : (l.description || "—")}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{l.thicknessMm || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {l.rateUnit === "PER_PIECE" ? "n/a" : `${num(lc.chargeLengthInch, 2)} x ${num(lc.chargeWidthInch, 2)}`}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{num(l.qty, 2)}</td>
                  <td className="px-3 py-2 text-slate-500">{RATE_UNIT_LABEL[l.rateUnit]}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{num(l.rate, 2)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{money(lc.basicAmount)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2.5">
                      <button type="button" onClick={() => handleEdit(l)} title="Edit" className="text-slate-400 hover:text-brand-700 transition">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleDelete(l.key)} title="Remove" className="text-slate-400 hover:text-red-600 transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleClearAll}
          disabled={lines.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash size={13} /> Clear All
        </button>
        <div className="text-sm text-slate-500">Total Items: <span className="font-semibold text-slate-800">{lines.length}</span></div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}
