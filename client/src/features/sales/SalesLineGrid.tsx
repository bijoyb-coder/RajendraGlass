import { useMemo } from "react";
import { Plus, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import {
  calculateLine,
  DIMENSION_UNITS,
  RATE_UNITS,
  RATE_UNIT_LABEL,
  CALC_METHOD_LABEL,
  DEFAULT_GST_PCT,
} from "../../lib/quotationCalc";
import type { DimensionUnit, RateUnit } from "../../lib/quotationCalc";
import type { CreateQuotationLine, ProductDto } from "../../lib/types";
import { useStockSummaryQuery } from "../reports/reportsApi";
import { parseGlassDimension } from "../../lib/glassDimension";

/**
 * The line-entry grid shared by Quotations and Sales Orders. Both documents hold the same
 * size / rate-basis / GST fields and are priced by the same engine, so they share one grid —
 * a second copy would be free to drift away from the first.
 */

const cellInput =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition";
/** An overridden cell is tinted amber so it is obvious the figure is not the computed one. */
const overriddenInput =
  "w-full rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-sm font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-300 transition";

function money(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}
function num(n: number, dp = 2) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/**
 * The two pricing conventions found in the business workbook (test.xlsx, Sheet3), plus flat
 * charges. Picking one sets the three rules that differ; each stays editable afterwards, and
 * "Custom" appears when a line no longer matches any preset.
 */
export const PRESETS = {
  SHEET_SQM: {
    label: "Sheet (m² × thickness)",
    rateUnit: "PER_SQM" as RateUnit,
    dimensionUnit: "METER" as DimensionUnit,
    applyThickness: true,
    chargeRoundingInch: 0,
  },
  CUT_SQFT: {
    label: 'Cut-to-size (sq.ft, round 6")',
    rateUnit: "PER_SQFT" as RateUnit,
    dimensionUnit: "INCH" as DimensionUnit,
    applyThickness: false,
    chargeRoundingInch: 6,
  },
  CHARGE: {
    label: "Charge / flat amount",
    rateUnit: "PER_PIECE" as RateUnit,
    dimensionUnit: "INCH" as DimensionUnit,
    applyThickness: false,
    chargeRoundingInch: 0,
  },
};
export type PresetKey = keyof typeof PRESETS;

export interface SalesLine {
  key: string;
  productId: number;
  description: string;
  /** Prefilled from the product master on selection, then freely editable. */
  thicknessMm: number;
  length: number;
  width: number;
  /** What's actually typed into the Length/Width cells -- kept separate from the parsed decimal
   * (`length`/`width`) so the field can show "20 1/4" while it's being typed rather than snapping
   * to "20.25" mid-keystroke. Accepts a plain decimal (1.22, 1.88) or glass-industry fraction
   * notation (20 1/4, 21 1/2, 20¼); parseGlassDimension converts either into the same decimal
   * `length`/`width` this line has always carried -- everything downstream (calcLine, save) is
   * unchanged. UI-only: never sent to the server. */
  lengthText: string;
  widthText: string;
  dimensionUnit: DimensionUnit;
  qty: number;
  rate: number;
  rateUnit: RateUnit;
  applyThickness: boolean;
  chargeRoundingInch: number;
  gstPct: number;
  discountPct: number;
  /** null = follow the calculation; a number = operator override. */
  manualArea: number | null;
  manualBasicAmount: number | null;
  /** Item-wise, all optional (default 0) -- summed across every line and priced at the document's
   * own hole/cutout rates (see the optional `holesCutout` prop below), not per line. */
  holeQty: number;
  bHoleQty: number;
  cutoutQty: number;
  bCutoutQty: number;
}

export const emptyLine = (preset: PresetKey = "SHEET_SQM"): SalesLine => ({
  key: crypto.randomUUID(),
  productId: 0,
  description: "",
  thicknessMm: 0,
  length: 0,
  width: 0,
  lengthText: "",
  widthText: "",
  qty: 1,
  rate: 0,
  gstPct: DEFAULT_GST_PCT,
  discountPct: 0,
  manualArea: null,
  manualBasicAmount: null,
  holeQty: 0,
  bHoleQty: 0,
  cutoutQty: 0,
  bCutoutQty: 0,
  ...PRESETS[preset],
});

export function presetOf(l: SalesLine): PresetKey | "CUSTOM" {
  for (const [k, p] of Object.entries(PRESETS)) {
    if (
      l.rateUnit === p.rateUnit &&
      l.applyThickness === p.applyThickness &&
      l.chargeRoundingInch === p.chargeRoundingInch
    )
      return k as PresetKey;
  }
  return "CUSTOM";
}

/** Live preview only — the server recalculates on save. `showGst = false` (Quotations) prices the
 * line as if its GST % were 0, without touching the line's own stored gstPct -- see the `showGst`
 * prop below. */
export function calcLine(l: SalesLine, showGst = true) {
  return calculateLine({
    length: l.length,
    width: l.width,
    dimensionUnit: l.dimensionUnit,
    qty: l.qty,
    rate: l.rate,
    rateUnit: l.rateUnit,
    thicknessMm: l.thicknessMm,
    applyThickness: l.applyThickness,
    chargeRoundingInch: l.chargeRoundingInch,
    gstPct: showGst ? l.gstPct : 0,
    discountPct: l.discountPct,
    manualArea: l.manualArea,
    manualBasicAmount: l.manualBasicAmount,
  });
}

/** A line is complete when it can be priced. */
export function isComplete(l: SalesLine) {
  if (l.qty <= 0) return false;
  if (l.manualBasicAmount != null) return true;
  if (l.rateUnit === "PER_PIECE") return l.rate > 0;
  if (l.manualArea != null) return l.rate > 0;
  return l.length > 0 && l.width > 0 && l.rate > 0;
}

/** The minimal shape needed to rebuild an editable line from a saved quotation/order line. */
interface SavedLineLike {
  productId?: number | null
  description?: string | null
  length: number
  width: number
  dimensionUnit: DimensionUnit
  qty: number
  rate: number
  rateUnit: RateUnit
  applyThickness: boolean
  chargeRoundingInch: number
  gstPct: number
  discountPct: number
  thicknessMm?: number | null
  manualArea?: number | null
  manualBasicAmount?: number | null
  holeQty?: number | null
  bHoleQty?: number | null
  cutoutQty?: number | null
  bCutoutQty?: number | null
}

/** Reconstructs an editable line from what the server returned — used to open a saved
 * quotation/order back into this grid (edit mode, or convert-to-order). */
export function fromSavedLine(l: SavedLineLike): SalesLine {
  return {
    key: crypto.randomUUID(),
    productId: l.productId ?? 0,
    description: l.description ?? "",
    thicknessMm: l.thicknessMm ?? 0,
    length: l.length,
    width: l.width,
    lengthText: l.length ? String(l.length) : "",
    widthText: l.width ? String(l.width) : "",
    dimensionUnit: l.dimensionUnit,
    qty: l.qty,
    rate: l.rate,
    rateUnit: l.rateUnit,
    applyThickness: l.applyThickness,
    chargeRoundingInch: l.chargeRoundingInch,
    gstPct: l.gstPct,
    discountPct: l.discountPct,
    manualArea: l.manualArea ?? null,
    manualBasicAmount: l.manualBasicAmount ?? null,
    holeQty: l.holeQty ?? 0,
    bHoleQty: l.bHoleQty ?? 0,
    cutoutQty: l.cutoutQty ?? 0,
    bCutoutQty: l.bCutoutQty ?? 0,
  };
}

export function toCreateLine(l: SalesLine): CreateQuotationLine {
  return {
    productId: l.productId || null,
    description: l.description || null,
    length: l.length,
    width: l.width,
    dimensionUnit: l.dimensionUnit,
    qty: l.qty,
    rate: l.rate,
    rateUnit: l.rateUnit,
    applyThickness: l.applyThickness,
    chargeRoundingInch: l.chargeRoundingInch,
    gstPct: l.gstPct,
    discountPct: l.discountPct,
    thicknessMm: l.thicknessMm,
    manualArea: l.manualArea,
    manualBasicAmount: l.manualBasicAmount,
    holeQty: l.holeQty,
    bHoleQty: l.bHoleQty,
    cutoutQty: l.cutoutQty,
    bCutoutQty: l.bCutoutQty,
  };
}

export function lineTotals(lines: SalesLine[], showGst = true) {
  return lines.reduce(
    (acc, l) => {
      const c = calcLine(l, showGst);
      return {
        basic: acc.basic + c.basicAmount,
        discount: acc.discount + c.discountAmount,
        gst: acc.gst + c.gstAmount,
        amount: acc.amount + c.finalAmount,
      };
    },
    { basic: 0, discount: 0, gst: 0, amount: 0 },
  );
}

const SQM_PER_SQFT = 1 / 10.7639;

/** Converts a calculated line area into the product's own stock unit (Sqm ⇄ Sqft) so the
 * shortage figure is comparable to what Stock Enquiry reports. Anything else (e.g. a stock
 * unit of "Nos") is left unconverted — better to show a same-numbers comparison the user can
 * judge than to silently skip the check. */
export function toStockUnit(value: number, fromAreaUnit: string, stockUnit?: string | null) {
  const from = fromAreaUnit.toUpperCase();
  const to = (stockUnit ?? "").toUpperCase();
  if (!to || from === to || (from === "SQM" && to === "SQM") || (from === "SQFT" && to === "SQFT")) return value;
  if (from === "SQM" && to.startsWith("SQFT")) return value / SQM_PER_SQFT;
  if (from === "SQFT" && to.startsWith("SQM")) return value * SQM_PER_SQFT;
  return value;
}

export interface StockShortage {
  required: number;
  qtyFree: number;
  short: number;
  unit: string;
}

/** The same "how much of this line's required stock is missing" calculation the live per-row
 * badge uses, exported standalone so a document (Quotation, Sales Order, ...) can run it once
 * more at submit time and refuse to save when any line is short — not just warn about it. */
export function getLineStockShortage(
  l: SalesLine,
  product: ProductDto | undefined,
  qtyFree: number,
): StockShortage | null {
  if (!l.productId || !product) return null;
  const c = calcLine(l);
  const required =
    l.rateUnit === "PER_PIECE" ? l.qty : toStockUnit(c.area, c.areaUnit, product.stockUnit) * l.qty;
  if (required <= 0) return null;
  const unit = l.rateUnit === "PER_PIECE" ? (product.stockUnit ?? "") : product.stockUnit ?? c.areaUnit;
  return { required, qtyFree, short: required - qtyFree, unit };
}

export interface HolesCutoutRates {
  holeRate: number;
  bHoleRate: number;
  cutoutRate: number;
  bCutoutRate: number;
  onChange: (patch: Partial<Pick<HolesCutoutRates, "holeRate" | "bHoleRate" | "cutoutRate" | "bCutoutRate">>) => void;
}

export interface RoundOffToggle {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

interface Props {
  lines: SalesLine[];
  products?: { items: ProductDto[] };
  onChange: (lines: SalesLine[]) => void;
  /** Renders the item-wise Hole/B-Hole/Cutout/B-Cutout columns plus the document-level rate
   * inputs in the totals footer. Omit to hide the whole feature (e.g. Sales Orders, which don't
   * use it) without duplicating this grid. */
  holesCutout?: HolesCutoutRates;
  /** false hides the GST % column and every GST figure in this grid (Quotations don't carry GST)
   * without touching a line's own stored gstPct or Sales Orders, which still price with GST.
   * Defaults to true so every existing caller keeps its current behaviour. */
  showGst?: boolean;
  /** Document-level "round to the nearest rupee" checkbox shown next to Total -- not per line.
   * Omit to leave the total unrounded (e.g. Sales Orders, which don't offer this). */
  roundOff?: RoundOffToggle;
}

export default function SalesLineGrid({ lines, products, onChange, holesCutout, showGst = true, roundOff }: Props) {
  // Free stock across every godown, by product — checked live as a product/qty is entered so a
  // shortage shows before the document is even saved, not discovered at dispatch time.
  const { data: stockSummary } = useStockSummaryQuery();
  const freeStockByProduct = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of stockSummary?.items ?? []) map.set(r.productId, r.qtyFree);
    return map;
  }, [stockSummary]);

  function stockShortage(l: SalesLine) {
    if (!l.productId) return null;
    const product = products?.items.find((p) => p.productId === l.productId);
    const qtyFree = freeStockByProduct.get(l.productId) ?? 0;
    return getLineStockShortage(l, product, qtyFree);
  }

  function updateLine(key: string, patch: Partial<SalesLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }
  function addLine() {
    const last = lines[lines.length - 1];
    const k = last ? presetOf(last) : "SHEET_SQM";
    onChange([...lines, emptyLine(k === "CUSTOM" ? "SHEET_SQM" : k)]);
  }
  function onProductChange(key: string, productId: number) {
    const product = products?.items.find((p) => p.productId === productId);
    // Seed rate and thickness from the master; both stay editable afterwards.
    updateLine(key, {
      productId,
      rate: product?.sellingRate ?? 0,
      thicknessMm: product?.thicknessMm ?? 0,
    });
  }

  const totals = lineTotals(lines, showGst);
  const totalHoleQty = lines.reduce((s, l) => s + (l.holeQty || 0), 0);
  const totalBHoleQty = lines.reduce((s, l) => s + (l.bHoleQty || 0), 0);
  const totalCutoutQty = lines.reduce((s, l) => s + (l.cutoutQty || 0), 0);
  const totalBCutoutQty = lines.reduce((s, l) => s + (l.bCutoutQty || 0), 0);
  const holesCutoutAmount = holesCutout
    ? totalHoleQty * holesCutout.holeRate +
      totalBHoleQty * holesCutout.bHoleRate +
      totalCutoutQty * holesCutout.cutoutRate +
      totalBCutoutQty * holesCutout.bCutoutRate
    : 0;
  const hasAnyHolesCutout = totalHoleQty > 0 || totalBHoleQty > 0 || totalCutoutQty > 0 || totalBCutoutQty > 0;
  const rawTotal = totals.amount + holesCutoutAmount;
  const displayTotal = roundOff?.enabled ? Math.round(rawTotal) : rawTotal;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1500px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="py-2 font-medium min-w-[190px]">Product / Description</th>
              <th className="py-2 font-medium w-20">Thick. (mm)</th>
              <th className="py-2 font-medium w-24">Length</th>
              <th className="py-2 font-medium w-24">Width</th>
              <th className="py-2 font-medium w-24">Unit</th>
              <th className="py-2 font-medium w-20">Qty</th>
              <th className="py-2 font-medium w-28">Area</th>
              <th className="py-2 font-medium w-24">Rate</th>
              <th className="py-2 font-medium w-28">Rate Unit</th>
              <th className="py-2 font-medium w-32">Basic Amount</th>
              <th className="py-2 font-medium w-20">Disc %</th>
              {showGst && <th className="py-2 font-medium w-20">GST %</th>}
              {holesCutout && (
                <>
                  <th className="py-2 font-medium w-16">Hole</th>
                  <th className="py-2 font-medium w-16">B-Hole</th>
                  <th className="py-2 font-medium w-16">Cutout</th>
                  <th className="py-2 font-medium w-16">B-Cutout</th>
                </>
              )}
              <th className="py-2 font-medium w-32 text-right">Final Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const c = calcLine(l, showGst);
              const preset = presetOf(l);
              const perPiece = l.rateUnit === "PER_PIECE";
              const shortage = stockShortage(l);
              return (
                <tr key={l.key} className="align-top">
                  {/* Product + free-text description + the per-line rules */}
                  <td className="py-2 pr-2">
                    <select
                      value={l.productId || ""}
                      onChange={(e) => onProductChange(l.key, Number(e.target.value))}
                      className={cellInput}
                    >
                      <option value="">No product (charge line)…</option>
                      {products?.items.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.code} — {p.description}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Description / remarks"
                      value={l.description}
                      onChange={(e) => updateLine(l.key, { description: e.target.value })}
                      className={`${cellInput} mt-1.5`}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <select
                        value={preset === "CUSTOM" ? "" : preset}
                        onChange={(e) =>
                          updateLine(l.key, { ...PRESETS[e.target.value as PresetKey] })
                        }
                        className="rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                      >
                        {preset === "CUSTOM" && <option value="">Custom…</option>}
                        {Object.entries(PRESETS).map(([k, p]) => (
                          <option key={k} value={k}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={l.applyThickness}
                          onChange={(e) => updateLine(l.key, { applyThickness: e.target.checked })}
                          className="rounded border-slate-300"
                        />
                        × thick
                      </label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        round
                        <select
                          value={l.chargeRoundingInch}
                          onChange={(e) =>
                            updateLine(l.key, { chargeRoundingInch: Number(e.target.value) })
                          }
                          className="rounded-md border border-slate-300 px-1 py-0.5 text-[11px]"
                        >
                          <option value={0}>off</option>
                          <option value={3}>3&quot;</option>
                          <option value={6}>6&quot;</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      {CALC_METHOD_LABEL[c.calculationMethod]}
                    </div>
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={l.thicknessMm || ""}
                      onChange={(e) => updateLine(l.key, { thicknessMm: Number(e.target.value) })}
                      className={cellInput}
                    />
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      disabled={perPiece}
                      placeholder="1.22 or 20 1/4"
                      value={l.lengthText}
                      onChange={(e) => {
                        const lengthText = e.target.value;
                        const parsed = parseGlassDimension(lengthText);
                        if (parsed !== null) updateLine(l.key, { lengthText, length: parsed });
                        else if (lengthText === "") updateLine(l.key, { lengthText, length: 0 });
                        else updateLine(l.key, { lengthText });
                      }}
                      className={`${cellInput} ${l.lengthText && parseGlassDimension(l.lengthText) === null ? "border-red-300" : ""} disabled:bg-slate-100 disabled:text-slate-400`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      disabled={perPiece}
                      placeholder="1.88 or 21 1/2"
                      value={l.widthText}
                      onChange={(e) => {
                        const widthText = e.target.value;
                        const parsed = parseGlassDimension(widthText);
                        if (parsed !== null) updateLine(l.key, { widthText, width: parsed });
                        else if (widthText === "") updateLine(l.key, { widthText, width: 0 });
                        else updateLine(l.key, { widthText });
                      }}
                      className={`${cellInput} ${l.widthText && parseGlassDimension(l.widthText) === null ? "border-red-300" : ""} disabled:bg-slate-100 disabled:text-slate-400`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={l.dimensionUnit}
                      disabled={perPiece}
                      onChange={(e) =>
                        updateLine(l.key, { dimensionUnit: e.target.value as DimensionUnit })
                      }
                      className={`${cellInput} disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {DIMENSION_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    {!perPiece && l.chargeRoundingInch > 0 && (
                      <div className="mt-1 text-[10px] text-brand-600 font-semibold">
                        → {num(c.chargeLengthInch, 2)}&quot; × {num(c.chargeWidthInch, 2)}&quot;
                      </div>
                    )}
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.qty || ""}
                      onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })}
                      className={cellInput}
                    />
                    {shortage && (
                      <div
                        className={`mt-1 flex items-center gap-1 text-[10px] font-medium ${
                          shortage.short > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {shortage.short > 0 ? (
                          <>
                            <AlertTriangle size={10} /> Short {num(shortage.short, 2)} {shortage.unit}
                          </>
                        ) : (
                          <>Free {num(shortage.qtyFree, 2)} {shortage.unit}</>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Area — computed, but the operator may replace it. */}
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      disabled={perPiece}
                      value={
                        perPiece
                          ? ""
                          : l.manualArea != null
                            ? l.manualArea
                            : Number(c.calculatedArea.toFixed(4))
                      }
                      onChange={(e) =>
                        updateLine(l.key, {
                          manualArea: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${l.manualArea != null ? overriddenInput : cellInput} disabled:bg-slate-100 disabled:text-slate-400`}
                    />
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                      <span>{perPiece ? "n/a" : c.areaUnit}</span>
                      {l.manualArea != null && (
                        <button
                          type="button"
                          title="Reset to calculated area"
                          onClick={() => updateLine(l.key, { manualArea: null })}
                          className="inline-flex items-center gap-0.5 text-amber-700 hover:text-amber-900 font-medium"
                        >
                          <RotateCcw size={10} /> reset
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.rate || ""}
                      onChange={(e) => updateLine(l.key, { rate: Number(e.target.value) })}
                      className={cellInput}
                    />
                    {l.applyThickness && (
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        eff. {num(c.effectiveRate, 2)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={l.rateUnit}
                      onChange={(e) => updateLine(l.key, { rateUnit: e.target.value as RateUnit })}
                      className={cellInput}
                    >
                      {RATE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {RATE_UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Basic amount — computed, but the operator may replace it. */}
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={
                        l.manualBasicAmount != null
                          ? l.manualBasicAmount
                          : Number(c.calculatedBasicAmount.toFixed(2))
                      }
                      onChange={(e) =>
                        updateLine(l.key, {
                          manualBasicAmount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={l.manualBasicAmount != null ? overriddenInput : cellInput}
                    />
                    {l.manualBasicAmount != null && (
                      <button
                        type="button"
                        title="Reset to calculated amount"
                        onClick={() => updateLine(l.key, { manualBasicAmount: null })}
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-amber-700 hover:text-amber-900 font-medium"
                      >
                        <RotateCcw size={10} /> reset to {num(c.calculatedBasicAmount, 2)}
                      </button>
                    )}
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={l.discountPct || ""}
                      onChange={(e) => updateLine(l.key, { discountPct: Number(e.target.value) })}
                      className={cellInput}
                    />
                  </td>
                  {showGst && (
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={l.gstPct}
                        onChange={(e) => updateLine(l.key, { gstPct: Number(e.target.value) })}
                        className={cellInput}
                      />
                    </td>
                  )}

                  {holesCutout && (
                    <>
                      <td className="py-2 pr-2">
                        <input type="number" min={0} step="0.01" value={l.holeQty || ""} onChange={(e) => updateLine(l.key, { holeQty: Number(e.target.value) })} className={cellInput} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" min={0} step="0.01" value={l.bHoleQty || ""} onChange={(e) => updateLine(l.key, { bHoleQty: Number(e.target.value) })} className={cellInput} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" min={0} step="0.01" value={l.cutoutQty || ""} onChange={(e) => updateLine(l.key, { cutoutQty: Number(e.target.value) })} className={cellInput} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" min={0} step="0.01" value={l.bCutoutQty || ""} onChange={(e) => updateLine(l.key, { bCutoutQty: Number(e.target.value) })} className={cellInput} />
                      </td>
                    </>
                  )}
                  <td className="py-2 pr-2 text-right font-medium text-slate-700">
                    {money(c.finalAmount)}
                    {showGst && (
                      <div className="text-[11px] font-normal text-slate-400">
                        {money(c.taxableAmount)} + {money(c.gstAmount)} GST
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-slate-400 hover:text-red-500 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus size={15} /> Add Line
        </button>
        <div className="text-sm text-right">
          <div className="text-slate-500">
            Basic: <span className="font-medium text-slate-700">{money(totals.basic)}</span>
          </div>
          {holesCutout && hasAnyHolesCutout && (
            <div className="my-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs space-y-1">
              {totalHoleQty > 0 && (
                <HolesCutoutRow label="Hole" qty={totalHoleQty} rate={holesCutout.holeRate} onRateChange={(v) => holesCutout.onChange({ holeRate: v })} />
              )}
              {totalBHoleQty > 0 && (
                <HolesCutoutRow label="B-Hole" qty={totalBHoleQty} rate={holesCutout.bHoleRate} onRateChange={(v) => holesCutout.onChange({ bHoleRate: v })} />
              )}
              {totalCutoutQty > 0 && (
                <HolesCutoutRow label="Cutout" qty={totalCutoutQty} rate={holesCutout.cutoutRate} onRateChange={(v) => holesCutout.onChange({ cutoutRate: v })} />
              )}
              {totalBCutoutQty > 0 && (
                <HolesCutoutRow label="B-Cutout" qty={totalBCutoutQty} rate={holesCutout.bCutoutRate} onRateChange={(v) => holesCutout.onChange({ bCutoutRate: v })} />
              )}
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-medium text-slate-700">
                <span>Holes &amp; Cutout</span><span>{money(holesCutoutAmount)}</span>
              </div>
            </div>
          )}
          {totals.discount > 0 && (
            <div className="text-slate-500">
              Discount: <span className="font-medium text-slate-700">− {money(totals.discount)}</span>
            </div>
          )}
          {showGst && (
            <div className="text-slate-500">
              GST: <span className="font-medium text-slate-700">{money(totals.gst)}</span>
            </div>
          )}
          {roundOff && (
            <label className="flex items-center justify-end gap-1.5 text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={roundOff.enabled}
                onChange={(e) => roundOff.onChange(e.target.checked)}
                className="rounded border-slate-300"
              />
              Round Off
              {roundOff.enabled && Math.abs(displayTotal - rawTotal) > 0.001 && (
                <span className="font-medium text-slate-700">
                  ({displayTotal - rawTotal >= 0 ? "+" : "−"}{money(Math.abs(displayTotal - rawTotal))})
                </span>
              )}
            </label>
          )}
          <div className="text-base font-bold text-brand-900 mt-0.5">
            Total: {money(displayTotal)}
          </div>
        </div>
      </div>
    </>
  );
}

function HolesCutoutRow({ label, qty, rate, onRateChange }: { label: string; qty: number; rate: number; onRateChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-slate-600">
      <span>{label} Qty: {num(qty, 2)}</span>
      <span className="inline-flex items-center gap-1">
        Rate
        <input
          type="number"
          min={0}
          step="0.01"
          value={rate || ""}
          onChange={(e) => onRateChange(Number(e.target.value))}
          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
        />
      </span>
    </div>
  );
}
