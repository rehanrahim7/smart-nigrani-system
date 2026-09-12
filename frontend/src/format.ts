/**
 * Formatting helpers.
 *
 * Indian administrative amounts are read in lakh and crore, not millions.
 * Showing "₹8.15 Cr" is what an official actually expects; "₹81,454,456" is
 * technically the same number and far harder to compare at a glance.
 */

import type { RiskLabel, SignalKey } from './types'

/** Shown wherever the source data simply has no value for a field. */
export const NONE = '-'

const LAKH = 100_000
const CRORE = 10_000_000

/** Compact Indian currency: ₹30 L, ₹1.5 Cr, ₹8,500. */
export function inr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NONE
  if (value === 0) return '₹0'

  const sign = value < 0 ? '-' : ''
  const amount = Math.abs(value)

  if (amount >= CRORE) {
    const crore = amount / CRORE
    return `${sign}₹${trim(crore, crore >= 100 ? 0 : 2)} Cr`
  }
  if (amount >= LAKH) {
    const lakh = amount / LAKH
    return `${sign}₹${trim(lakh, lakh >= 100 ? 0 : 2)} L`
  }
  return `${sign}₹${amount.toLocaleString('en-IN')}`
}

/** Full rupee figure with Indian digit grouping, for detail views and tooltips. */
export function inrFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NONE
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function trim(value: number, decimals: number): string {
  // 1.50 -> 1.5, 2.00 -> 2
  return value.toFixed(decimals).replace(/\.?0+$/, '')
}

/** 12345 -> "12,345" */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NONE
  return value.toLocaleString('en-IN')
}

/** 0.5033 -> "50%" */
export function percent(ratio: number | null | undefined, decimals = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return NONE
  return `${(ratio * 100).toFixed(decimals)}%`
}

/** "2025-02-10" -> "10 Feb 2025" */
export function date(value: string | null | undefined): string {
  if (!value) return NONE
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** 759 -> "2 years 1 month". Easier to judge than a raw day count. */
export function duration(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) return NONE
  const whole = Math.max(0, Math.round(days))
  if (whole < 45) return `${whole} day${whole === 1 ? '' : 's'}`
  if (whole < 365) return `${Math.round(whole / 30)} months`
  const years = Math.floor(whole / 365)
  const months = Math.round((whole % 365) / 30)
  const y = `${years} year${years === 1 ? '' : 's'}`
  return months ? `${y} ${months} month${months === 1 ? '' : 's'}` : y
}

export const RISK_CLASS: Record<RiskLabel, string> = {
  'Critical Review': 'sev-critical',
  'High Review': 'sev-high',
  'Medium Review': 'sev-medium',
  Routine: 'sev-routine',
}

/**
 * The CSS variable that holds each severity colour.
 *
 * Components that render HTML can use `var(--critical)` directly. The map
 * cannot: it paints onto a canvas, and a canvas needs a real colour value. It
 * resolves these names through cssColour() in theme.tsx, which also means the
 * markers follow a theme change instead of keeping a stale copy.
 */
export const RISK_VAR: Record<RiskLabel, string> = {
  'Critical Review': '--critical',
  'High Review': '--high',
  'Medium Review': '--medium',
  Routine: '--routine',
}

/** For use in inline styles, where CSS variables work normally. */
export const RISK_COLOR: Record<RiskLabel, string> = {
  'Critical Review': 'var(--critical)',
  'High Review': 'var(--high)',
  'Medium Review': 'var(--medium)',
  Routine: 'var(--routine)',
}

/** Shorter label for tight spaces such as map pins and table chips. */
export const RISK_SHORT: Record<RiskLabel, string> = {
  'Critical Review': 'Critical',
  'High Review': 'High',
  'Medium Review': 'Medium',
  Routine: 'Routine',
}

export const SIGNAL_COLOR: Record<SignalKey, string> = {
  cost: 'var(--sig-cost)',
  duplicate: 'var(--sig-duplicate)',
  delay: 'var(--sig-delay)',
  payment: 'var(--sig-payment)',
}

export const SIGNAL_LABEL: Record<SignalKey, string> = {
  cost: 'Cost',
  duplicate: 'Repeat',
  delay: 'Time',
  payment: 'Money',
}

/** The longer name, used where there is room for it. */
export const SIGNAL_TITLE: Record<SignalKey, string> = {
  cost: 'Cost compared with similar works',
  duplicate: 'Looks like another work',
  delay: 'Taking too long',
  payment: 'Money paid ahead of progress',
}

/** The score at which each detector is considered to have fired. Mirrors the
 *  thresholds in the Python pipeline — keep the two in step. */
export const SIGNAL_THRESHOLD: Record<SignalKey, number> = {
  cost: 50,
  duplicate: 75,
  delay: 60,
  payment: 50,
}

export const SIGNAL_ORDER: SignalKey[] = ['cost', 'duplicate', 'delay', 'payment']

/** Today, as YYYY-MM-DD in local time, for date input defaults. */
export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** Title-cases the ALL CAPS names that appear in the MPLADS source data. */
export function properName(value: string | null | undefined): string {
  if (!value) return NONE
  const cleaned = value.trim()
  if (!/[a-z]/.test(cleaned)) {
    return cleaned
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\bDr\b/g, 'Dr.')
  }
  return cleaned
}
