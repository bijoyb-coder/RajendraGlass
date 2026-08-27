/** Mirrors server/Data/GlassDimensionParser.cs exactly -- same fraction rules, purely for live UI
 * feedback in the Cutting Entry grid. The actual save always re-parses the raw text server-side;
 * this is never trusted as the authoritative value. */

const UNICODE_FRACTIONS: Record<string, number> = {
  '⅛': 0.125,
  '¼': 0.25,
  '⅜': 0.375,
  '½': 0.5,
  '⅝': 0.625,
  '¾': 0.75,
  '⅞': 0.875,
}

const ASCII_FRACTION_PATTERN = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/
const UNICODE_FRACTION_PATTERN = /^(\d+)\s*([⅛¼⅜½⅝¾⅞])\s*"?$/

/** Returns null (never throws) for anything unparseable -- the caller shows a validation message,
 * this never crashes the page on bad input. */
export function parseGlassDimension(input: string): number | null {
  if (!input || !input.trim()) return null
  const text = input.trim().replace(/["″”]+$/, '')

  const plain = Number(text)
  if (!Number.isNaN(plain) && text !== '') return plain > 0 ? plain : null

  const unicodeMatch = UNICODE_FRACTION_PATTERN.exec(text)
  if (unicodeMatch) {
    const whole = Number(unicodeMatch[1])
    const fraction = UNICODE_FRACTIONS[unicodeMatch[2]]
    const value = whole + fraction
    return value > 0 ? value : null
  }

  const asciiMatch = ASCII_FRACTION_PATTERN.exec(text)
  if (asciiMatch) {
    const whole = Number(asciiMatch[1])
    const numerator = Number(asciiMatch[2])
    const denominator = Number(asciiMatch[3])
    if (denominator === 0) return null
    const value = whole + numerator / denominator
    return value > 0 ? value : null
  }

  return null
}
