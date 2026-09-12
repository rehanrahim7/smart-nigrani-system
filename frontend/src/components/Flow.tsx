/**
 * The diagram pieces used on the "How it works" page.
 *
 * All of them are built from ordinary boxes and text rather than drawn as one
 * fixed picture. A drawn picture has a fixed width, so on a phone it either
 * shrinks until nobody can read it or runs off the side. Boxes reflow: a row
 * of six steps on a laptop becomes a column of six on a phone, and every word
 * stays the same readable size.
 *
 * Each diagram matches the shape of the thing it is describing, which is the
 * whole point of drawing it:
 *
 *   Steps       one thing after another, joined by a line you can follow
 *   MergeDown   several things becoming one thing
 *   ScoreScale  one number split into bands
 *   SplitPath   one thing handled two different ways
 */

import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------
   Steps: a numbered chain.

   Wide screen: numbers sit on a horizontal line, captions underneath.
   Narrow screen: the same line turns and runs down the left edge.
   Either way it is one continuous line, so the order is obvious without
   having to read a single arrow.
   ------------------------------------------------------------------------- */

export interface Step {
  label: string
  detail?: string
  /** Colours the number only. Used where the colour carries meaning. */
  tone?: 'plain' | 'accent' | 'warn'
}

export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps" aria-label="Steps, in order">
      {steps.map((step, index) => (
        <li key={step.label} className="step">
          <div className="step-rail">
            <span className={`step-dot step-${step.tone ?? 'plain'}`}>{index + 1}</span>
          </div>
          <div className="step-body">
            <span className="step-label">{step.label}</span>
            {step.detail && <span className="step-detail">{step.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* -------------------------------------------------------------------------
   MergeDown: several inputs becoming one output.

   Arrows in a row would say "first this file, then that file", which is not
   what happens. They all arrive together and are joined. So the inputs sit
   side by side and the whole group narrows into one bar underneath.
   ------------------------------------------------------------------------- */

export function MergeDown({
  inputs,
  output,
  outputDetail,
}: {
  inputs: { label: string; detail?: string }[]
  output: string
  outputDetail?: string
}) {
  return (
    <div className="merge">
      <ul className="merge-inputs">
        {inputs.map((input) => (
          <li key={input.label} className="merge-input">
            <span className="merge-input-label">{input.label}</span>
            {input.detail && <span className="merge-input-detail">{input.detail}</span>}
          </li>
        ))}
      </ul>

      {/* The funnel. Drawn with borders so it scales with the text. */}
      <div className="merge-neck" aria-hidden="true">
        <span className="merge-neck-line" />
      </div>

      <div className="merge-output">
        <span className="merge-output-label">{output}</span>
        {outputDetail && <span className="merge-output-detail">{outputDetail}</span>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
   ScoreScale: one number, four bands.

   The old version of this was a row of arrows, which was wrong: 75 does not
   lead to 55. It is one scale, so it is drawn as one bar.
   ------------------------------------------------------------------------- */

export interface Band {
  name: string
  range: string
  note: string
  colour: string
  /** Share of the 0 to 100 scale this band covers. */
  width: number
}

export function ScoreScale({ bands }: { bands: Band[] }) {
  return (
    <div className="scale">
      <div className="scale-bar">
        {bands.map((band) => (
          <span
            key={band.name}
            className="scale-seg"
            style={{ flex: band.width, background: band.colour }}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* The numbers sit exactly where the colours change, so the bar can be
          read off against them rather than guessed at. */}
      <div className="scale-ticks" aria-hidden="true">
        {boundaries(bands).map(({ value, at }) => (
          <span
            key={value}
            className="scale-tick"
            style={{
              left: `${at}%`,
              transform: at === 0 ? 'none' : at === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {value}
          </span>
        ))}
      </div>

      <ul className="scale-keys">
        {bands.map((band) => (
          <li key={band.name} className="scale-key">
            <span className="scale-swatch" style={{ background: band.colour }} />
            <span className="scale-key-text">
              <span className="scale-key-name">
                {band.name}
                <span className="scale-key-range">{band.range}</span>
              </span>
              <span className="scale-key-note">{band.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Where one band ends and the next begins, as a percentage across the bar. */
function boundaries(bands: Band[]) {
  const total = bands.reduce((sum, band) => sum + band.width, 0) || 100
  const marks: { value: number; at: number }[] = [{ value: 0, at: 0 }]

  let running = 0
  for (const band of bands) {
    running += band.width
    marks.push({ value: Math.round((running / total) * 100), at: (running / total) * 100 })
  }
  return marks
}

/* -------------------------------------------------------------------------
   SplitPath: one starting point, two different routes.
   ------------------------------------------------------------------------- */

export function SplitPath({
  start,
  branches,
}: {
  start: { label: string; detail?: string }
  branches: { label: string; detail: string; tone?: 'accent' | 'warn' }[]
}) {
  return (
    <div className="split">
      <div className="split-start">
        <span className="step-label">{start.label}</span>
        {start.detail && <span className="step-detail">{start.detail}</span>}
      </div>

      <div className="split-fork" aria-hidden="true">
        <span className="split-fork-line" />
      </div>

      <div className="split-branches">
        {branches.map((branch) => (
          <div key={branch.label} className={`split-branch split-${branch.tone ?? 'plain'}`}>
            <span className="step-label">{branch.label}</span>
            <span className="step-detail">{branch.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
   A labelled panel, used to wrap each diagram with a heading and a sentence
   saying what you are looking at.
   ------------------------------------------------------------------------- */

export function Figure({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: ReactNode
}) {
  return (
    <figure className="figure">
      <figcaption className="label figure-title">{title}</figcaption>
      {children}
      {caption && <p className="figure-caption">{caption}</p>}
    </figure>
  )
}

/* -------------------------------------------------------------------------
   Two things side by side, for comparisons.
   ------------------------------------------------------------------------- */

export function SideBySide({ children }: { children: ReactNode }) {
  return <div className="side-by-side">{children}</div>
}

export function Card({
  heading,
  eyebrow,
  children,
  accent,
}: {
  heading: string
  eyebrow?: string
  children: ReactNode
  /** Shown as a small dot beside the eyebrow, not as a stripe on an edge. */
  accent?: string
}) {
  return (
    <div className="info-card">
      {eyebrow && (
        <div className="row info-card-eyebrow" style={{ gap: 7 }}>
          {accent && <span className="info-card-dot" style={{ background: accent }} />}
          <span className="label">{eyebrow}</span>
        </div>
      )}
      <h3 className="info-card-heading">{heading}</h3>
      <div className="info-card-body">{children}</div>
    </div>
  )
}
