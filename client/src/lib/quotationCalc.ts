/**
 * Display-only mirror of server/Data/QuotationCalculator.cs, so the quotation grid can show
 * live figures as the operator types. The server recalculates everything on save and its
 * result is what gets stored — nothing here is ever the source of truth.
 *
 * Rules reverse-engineered from the business workbook (test.xlsx, Sheet3); see the C# file
 * for the full derivation.
 */

export type DimensionUnit = "MM" | "CM" | "INCH" | "FEET" | "METER";
export type RateUnit = "PER_SQFT" | "PER_SQM" | "PER_PIECE";
export type CalculationMethod =
  | "AUTO_AREA_SQFT"
  | "AUTO_AREA_SQM"
  | "AUTO_PIECE"
  | "MANUAL_AREA"
  | "MANUAL_OVERRIDE";

export const DIMENSION_UNITS: DimensionUnit[] = [
  "MM",
  "CM",
  "INCH",
  "FEET",
  "METER",
];
export const RATE_UNITS: RateUnit[] = ["PER_SQFT", "PER_SQM", "PER_PIECE"];

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  PER_SQFT: "per sq.ft",
  PER_SQM: "per sq.m",
  PER_PIECE: "per piece",
};

export const CALC_METHOD_LABEL: Record<CalculationMethod, string> = {
  AUTO_AREA_SQFT: "Auto · sq.ft",
  AUTO_AREA_SQM: "Auto · sq.m",
  AUTO_PIECE: "Auto · piece",
  MANUAL_AREA: "Manual area",
  MANUAL_OVERRIDE: "Manual amount",
};

export const SQ_INCHES_PER_SQ_FOOT = 144;
export const DEFAULT_GST_PCT = 18;

/** Inches per one unit — everything normalises through inches. */
export function inchesPer(unit: DimensionUnit): number {
  switch (unit) {
    case "MM":
      return 1 / 25.4;
    case "CM":
      return 10 / 25.4;
    case "INCH":
      return 1;
    case "FEET":
      return 12;
    case "METER":
      return 1000 / 25.4;
    default:
      return 1;
  }
}

/** Rounds a dimension up to the next whole multiple of `stepInch`; 0 disables rounding. */
export function roundUpToStep(inches: number, stepInch: number): number {
  if (!stepInch || stepInch <= 0) return inches;
  // Guard against float noise turning an exact multiple into the next step up.
  return Math.ceil(Number((inches / stepInch).toFixed(9))) * stepInch;
}

export interface LineCalcInput {
  length: number;
  width: number;
  dimensionUnit: DimensionUnit;
  qty: number;
  rate: number;
  rateUnit: RateUnit;
  thicknessMm: number;
  applyThickness: boolean;
  chargeRoundingInch: number;
  gstPct: number;
  discountPct: number;
  manualArea?: number | null;
  manualBasicAmount?: number | null;
}

export interface LineCalcResult {
  lengthInch: number;
  widthInch: number;
  chargeLengthInch: number;
  chargeWidthInch: number;
  calculatedArea: number;
  area: number;
  areaUnit: "SQFT" | "SQM" | "PIECE";
  effectiveRate: number;
  calculatedBasicAmount: number;
  basicAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  finalAmount: number;
  calculationMethod: CalculationMethod;
  isAreaManualOverride: boolean;
  isAmountManualOverride: boolean;
}

export function calculateLine(i: LineCalcInput): LineCalcResult {
  const perInch = inchesPer(i.dimensionUnit);
  const lengthInch = i.length * perInch;
  const widthInch = i.width * perInch;

  const chargeLengthInch = roundUpToStep(lengthInch, i.chargeRoundingInch);
  const chargeWidthInch = roundUpToStep(widthInch, i.chargeRoundingInch);

  let calculatedArea: number;
  let areaUnit: LineCalcResult["areaUnit"];
  if (i.rateUnit === "PER_SQFT") {
    calculatedArea =
      (chargeLengthInch * chargeWidthInch) / SQ_INCHES_PER_SQ_FOOT;
    areaUnit = "SQFT";
  } else if (i.rateUnit === "PER_PIECE") {
    calculatedArea = 0;
    areaUnit = "PIECE";
  } else {
    calculatedArea =
      ((chargeLengthInch * 25.4) / 1000) * ((chargeWidthInch * 25.4) / 1000);
    areaUnit = "SQM";
  }

  const areaOverridden = i.manualArea != null && i.rateUnit !== "PER_PIECE";
  const area = areaOverridden ? (i.manualArea as number) : calculatedArea;

  // Sheet3's meter convention folds thickness into the rate (its hidden H column).
  const effectiveRate = i.applyThickness ? i.rate * i.thicknessMm : i.rate;

  const calculatedBasicAmount =
    i.rateUnit === "PER_PIECE"
      ? i.qty * effectiveRate
      : area * i.qty * effectiveRate;

  const amountOverridden = i.manualBasicAmount != null;
  const basicAmount = amountOverridden
    ? (i.manualBasicAmount as number)
    : calculatedBasicAmount;

  let discountAmount = (basicAmount * i.discountPct) / 100;
  if (discountAmount < 0) discountAmount = 0;
  if (discountAmount > basicAmount) discountAmount = basicAmount;

  const taxableAmount = basicAmount - discountAmount;
  const gstAmount = (taxableAmount * i.gstPct) / 100;
  const finalAmount = taxableAmount + gstAmount;

  const calculationMethod: CalculationMethod = amountOverridden
    ? "MANUAL_OVERRIDE"
    : areaOverridden
      ? "MANUAL_AREA"
      : i.rateUnit === "PER_SQFT"
        ? "AUTO_AREA_SQFT"
        : i.rateUnit === "PER_PIECE"
          ? "AUTO_PIECE"
          : "AUTO_AREA_SQM";

  return {
    lengthInch,
    widthInch,
    chargeLengthInch,
    chargeWidthInch,
    calculatedArea,
    area,
    areaUnit,
    effectiveRate,
    calculatedBasicAmount,
    basicAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    finalAmount,
    calculationMethod,
    isAreaManualOverride: areaOverridden,
    isAmountManualOverride: amountOverridden,
  };
}
