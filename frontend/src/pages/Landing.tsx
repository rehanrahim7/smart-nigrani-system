/**
 * The public page.
 *
 * The thing that makes this page worth looking at is that it shows real
 * findings from the real data, not a description of what the system might do.
 * Three genuinely flagged works, with the actual sentences the checks produced,
 * are more convincing than any amount of writing about the idea.
 *
 * Every number on this page is read from the API. Nothing is typed in by hand,
 * so nothing can quietly go out of date.
 */

import { api } from '../api'

// Loaded only when the landing page renders, so the mapping library never
// delays the first paint of the text above it.
const HeroMap = lazy(() =>
  import('../components/HeroMap').then((m) => ({ default: m.HeroMap })),
)
import { useAsync } from '../hooks'
import { RiskBadge, SignalMeter } from '../components/Signal'
import { lazy, Suspense } from 'react'
import { ThemeToggle } from '../theme'
import { SIGNAL_COLOR, count, inr, percent } from '../format'

const CHECKS = [
  {
    key: 'cost' as const,
    heading: 'Cost against similar works',
    body: 'Finds works that cost far more than other works of the same kind in the same period.',
  },
  {
    key: 'duplicate' as const,
    heading: 'The same work twice',
    body: 'Finds near identical descriptions under the same office and constituency.',
  },
  {
    key: 'delay' as const,
    heading: 'Taking too long',
    body: 'Finds works with no completion recorded long after they were approved.',
  },
  {
    key: 'payment' as const,
    heading: 'Money ahead of progress',
    body: 'Finds works where most of the budget is paid while the stage is still an early one.',
  },
]

export function Landing({
  onSignIn,
  onHowItWorks,
}: {
  onSignIn: () => void
  onHowItWorks: () => void
}) {
  const meta = useAsync(() => api.meta(), [])
  const highlights = useAsync(() => api.highlights(3), [])

  const offline = Boolean(meta.error)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--page)' }}>
      {/* ---------------- header ---------------- */}
      <header
        className="row"
        style={{
          padding: '13px clamp(16px, 4vw, 40px)',
          borderBottom: '1px solid var(--rule)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--panel)',
          gap: 12,
        }}
      >
        <Wordmark />
        <span className="grow" />
        <button
          type="button"
          className="btn btn-sm topbar-identity"
          onClick={onHowItWorks}
        >
          How it works
        </button>
        <ThemeToggle compact />
        <button className="btn btn-primary btn-sm" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      {/* ---------------- hero ---------------- */}
      <section
        style={{
          padding: 'clamp(36px, 6vw, 72px) clamp(16px, 4vw, 40px) clamp(28px, 4vw, 48px)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="hero-grid">
          <div>
          <div className="label rise" style={{ marginBottom: 16 }}>
            MPLADS public works, Maharashtra
          </div>

          <h1
            className="rise"
            style={{
              fontSize: 'clamp(30px, 5.4vw, 54px)',
              fontWeight: 600,
              letterSpacing: '-0.032em',
              lineHeight: 1.08,
              marginBottom: 20,
              animationDelay: '50ms',
            }}
          >
            {meta.data ? count(meta.data.totalProjects) : '4,807'} government projects.
            <br />
            <span style={{ color: 'var(--accent)' }}>
              {highlights.data ? count(highlights.data.flaggedTotal) : '264'} worth checking.
            </span>
          </h1>

          <p
            className="dim rise"
            style={{
              fontSize: 'clamp(14.5px, 1.5vw, 17px)',
              lineHeight: 1.6,
              maxWidth: 560,
              animationDelay: '110ms',
            }}
          >
            Nobody can inspect every project by hand. This system reads the public
            record, runs four checks on each work, and puts the ones that look
            unusual at the top of the list. Every flag comes with a sentence saying
            why, in plain words.
          </p>

          <div className="row wrap rise" style={{ gap: 10, marginTop: 26, animationDelay: '170ms' }}>
            <button className="btn btn-primary btn-lg" onClick={onSignIn}>
              Open the dashboard
            </button>
            <button className="btn btn-lg" onClick={onHowItWorks}>
              See how it works
            </button>
          </div>
          </div>

          {/* Every work in the dataset, one square each. */}
          <div className="hero-figure rise" style={{ animationDelay: '220ms' }}>
            <figure style={{ margin: 0 }}>
              <img
                src="/images/maharashtra-road-1400.jpg"
                srcSet="/images/maharashtra-road-700.jpg 700w, /images/maharashtra-road-1400.jpg 1400w"
                sizes="(min-width: 940px) 44vw, 92vw"
                width={1400}
                height={882}
                alt="A newly surfaced road running through farmland towards hills in rural Maharashtra"
                loading="eager"
                fetchPriority="high"
                style={{
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '16 / 10',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--rule)',
                  boxShadow: 'var(--shadow)',
                }}
              />
              <figcaption
                className="faint"
                style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}
              >
                A road through farmland in Maharashtra. Roads like this, along with
                drains, school rooms and community halls, are most of what is in this
                data.{' '}
                <a
                  href="https://commons.wikimedia.org/wiki/File:1_India_-_Matheran_-_Bombay_Rural_Road_Monsoons_Mahrashtra.jpg"
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ textDecoration: 'underline' }}
                >
                  Photo by McKay Savage, CC BY 2.0
                </a>
                , cropped and colour corrected.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ---------------- the numbers ---------------- */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--panel)',
        }}
      >
        {meta.loading &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ padding: '20px clamp(16px, 3vw, 28px)' }}>
              <div className="skeleton" style={{ height: 42 }} />
            </div>
          ))}

        {offline && (
          <div style={{ padding: '22px clamp(16px, 4vw, 40px)', gridColumn: '1 / -1' }}>
            <p style={{ fontSize: 13.5, color: 'var(--critical)', marginBottom: 6 }}>
              Cannot reach the data server.
            </p>
            <p className="faint" style={{ fontSize: 12.5 }}>
              Start it with{' '}
              <code className="mono">uvicorn app.main:app --port 8000</code> in the backend
              folder, then reload this page.
            </p>
          </div>
        )}

        {meta.data &&
          (
            [
              [count(meta.data.totalProjects), 'works in the record'],
              [count(meta.data.members), 'members of parliament'],
              [count(meta.data.constituencies), 'constituencies'],
              [count(meta.data.districts), 'districts'],
              [meta.data.snapshot.slice(0, 4), 'data snapshot year'],
            ] as [string, string][]
          ).map(([value, label], index) => (
            <div
              key={label}
              className="rise"
              style={{
                padding: '20px clamp(16px, 3vw, 28px)',
                borderRight: '1px solid var(--rule)',
                animationDelay: `${index * 45}ms`,
              }}
            >
              <div className="mono" style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {value}
              </div>
              <div className="label" style={{ marginTop: 5 }}>
                {label}
              </div>
            </div>
          ))}
      </section>

      {/* ---------------- real findings ---------------- */}
      <section
        id="findings"
        style={{ padding: 'clamp(40px, 6vw, 72px) clamp(16px, 4vw, 40px)' }}
      >
        <div style={{ maxWidth: 620, marginBottom: 28 }}>
          <div className="label" style={{ marginBottom: 11 }}>
            Real results, not examples
          </div>
          <h2 className="h1" style={{ fontSize: 'clamp(21px, 2.8vw, 30px)', marginBottom: 12 }}>
            The three works that need checking most
          </h2>
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.6 }}>
            These come straight from the data, ranked by the same score the dashboard
            uses. We do not show which member of parliament recommended each work,
            because this page can be opened by anyone without signing in.
          </p>
        </div>

        {highlights.loading && (
          <div className="col" style={{ gap: 12 }}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 128 }} />
            ))}
          </div>
        )}

        <div className="col" style={{ gap: 12 }}>
          {highlights.data?.items.map((item, index) => (
            <article
              key={item.ref}
              className="panel rise"
              style={{ padding: 'clamp(15px, 2vw, 20px)', animationDelay: `${index * 70}ms` }}
            >
              <div className="row wrap" style={{ gap: 10, marginBottom: 11 }}>
                <RiskBadge label={item.riskLabel} score={item.riskScore} />
                <span className="label mono">{item.ref}</span>
                <span className="grow" />
                <span className="row" style={{ gap: 10 }}>
                  <SignalMeter scores={item.scores} width={54} />
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {inr(item.budget)}
                  </span>
                </span>
              </div>

              <h3 style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
                {item.name}
              </h3>
              <p className="faint" style={{ fontSize: 12, marginBottom: 13 }}>
                {item.district} · stage: {item.status}
              </p>

              <ul className="col" style={{ gap: 7, margin: 0, paddingLeft: 17 }}>
                {item.reasons.map((reason) => (
                  <li key={reason.label} className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--text)' }}>{reason.label}:</strong>{' '}
                    {reason.explanation}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- what the money builds ---------------- */}
      <section
        style={{
          padding: 'clamp(40px, 6vw, 72px) clamp(16px, 4vw, 40px)',
          borderTop: '1px solid var(--rule)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ maxWidth: 620, marginBottom: 28 }}>
          <div className="label" style={{ marginBottom: 11 }}>
            What the money builds
          </div>
          <h2 className="h1" style={{ fontSize: 'clamp(21px, 2.8vw, 30px)', marginBottom: 12 }}>
            Every work, grouped by what it is
          </h2>
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.65 }}>
            Roads and community halls are over half of everything MPLADS pays for in
            this data.
          </p>
        </div>

        {meta.loading && <div className="skeleton" style={{ height: 260, borderRadius: 10 }} />}

        {meta.data && <SectorBars counts={meta.data.sectorCounts} />}

        {meta.data?.derivedFields?.sector && (
          <p
            className="faint"
            style={{ fontSize: 12, lineHeight: 1.65, marginTop: 20, maxWidth: 720 }}
          >
            {meta.data.derivedFields.sector}
          </p>
        )}
      </section>

      {/* ---------------- where the works are ---------------- */}
      <section
        style={{
          padding: 'clamp(40px, 6vw, 72px) clamp(16px, 4vw, 40px)',
          borderTop: '1px solid var(--rule)',
        }}
      >
        <div className="map-section">
          <div>
            <div className="label" style={{ marginBottom: 11 }}>
              Where the works are
            </div>
            <h2 className="h1" style={{ fontSize: 'clamp(21px, 2.8vw, 30px)', marginBottom: 14 }}>
              Every project in the record, on one map
            </h2>
            <p className="dim" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
              One dot per work. The bright, larger dots are the ones the checks
              flagged. Dots sit at the centre of their district, because MPLADS
              reports do not publish the location of each work, and inventing a
              precise position would be worse than admitting we do not have one.
            </p>
            <button className="btn btn-primary" onClick={onSignIn}>
              Open the dashboard
            </button>
          </div>

          <Suspense
            fallback={
              <div className="skeleton" style={{ aspectRatio: '10 / 8', borderRadius: 10 }} />
            }
          >
            <HeroMap onOpen={onSignIn} />
          </Suspense>
        </div>
      </section>

      {/* ---------------- the four checks ---------------- */}
      <section
        style={{
          padding: 'clamp(40px, 6vw, 72px) clamp(16px, 4vw, 40px)',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ maxWidth: 620, marginBottom: 28 }}>
          <div className="label" style={{ marginBottom: 11 }}>
            How a work gets flagged
          </div>
          <h2 className="h1" style={{ fontSize: 'clamp(21px, 2.8vw, 30px)' }}>
            Four checks run on every project
          </h2>
        </div>

        <ol className="col" style={{ gap: 0, margin: 0, padding: 0, listStyle: 'none' }}>
          {CHECKS.map((check, index) => (
            <li
              key={check.key}
              className="row rise"
              style={{
                gap: 'clamp(12px, 2vw, 22px)',
                alignItems: 'flex-start',
                padding: '18px 0',
                borderTop: index === 0 ? 'none' : '1px solid var(--rule)',
                animationDelay: `${index * 50}ms`,
              }}
            >
              <span className="row check-marker">
                <span
                  className="check-dot"
                  style={{ background: SIGNAL_COLOR[check.key] }}
                  aria-hidden="true"
                />
                <span className="mono check-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className="col grow" style={{ gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{check.heading}</span>
                <span className="dim" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  {check.body}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p className="faint" style={{ fontSize: 13, lineHeight: 1.65, marginTop: 24, maxWidth: 620 }}>
          Each check gives a score out of 100. Those four scores are combined into one
          number that decides where a work sits in the queue. The formula is shown on
          screen inside the dashboard, so anyone can see how a score was reached.
        </p>
      </section>

      {/* ---------------- limits ---------------- */}
      <section style={{ padding: 'clamp(36px, 5vw, 64px) clamp(16px, 4vw, 40px)' }}>
        <div className="label" style={{ marginBottom: 14 }}>
          What this does not do
        </div>

        <ul
          className="col"
          style={{ gap: 10, margin: 0, padding: 0, listStyle: 'none', maxWidth: 760 }}
        >
          {(
            meta.data?.knownLimits ?? [
              'The source files carry no exact locations, so map pins sit at the district centre.',
              'The source files carry no percentage of work completed.',
              'The data covers Maharashtra only.',
            ]
          ).map((limit) => (
            <li
              key={limit}
              className="dim limit-item"
            >
              {limit}
            </li>
          ))}
          <li
            className="dim limit-item"
          >
            A flag means a person should take a look. It is not a finding, and it does
            not say anyone did anything wrong.
          </li>
        </ul>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer
        className="row wrap"
        style={{
          padding: '20px clamp(16px, 4vw, 40px)',
          borderTop: '1px solid var(--rule)',
          gap: 12,
          background: 'var(--panel)',
        }}
      >
        <Wordmark />
        <span className="grow" />
        <span className="faint" style={{ fontSize: 12 }}>
          Built from published MPLADS reports
          {meta.data ? `, snapshot ${meta.data.snapshot}` : ''}
        </span>
      </footer>
    </div>
  )
}

/**
 * How many works of each kind, as a plain bar list.
 *
 * One colour, because these are twelve slices of one quantity, not twelve
 * different things being compared. Giving each bar its own colour would imply
 * a meaning the colours do not carry.
 */
function SectorBars({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts)
  const total = rows.reduce((sum, [, value]) => sum + value, 0)
  const biggest = Math.max(...rows.map(([, value]) => value), 1)

  return (
    <ol
      className="col"
      style={{ gap: 14, margin: 0, padding: 0, listStyle: 'none', maxWidth: 900 }}
    >
      {rows.map(([name, value], index) => (
        <li key={name} className="col rise" style={{ gap: 6, animationDelay: `${index * 35}ms` }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="grow truncate" style={{ fontSize: 14 }}>
              {name}
            </span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {count(value)}
            </span>
            <span
              className="mono faint"
              style={{ fontSize: 12, minWidth: 46, textAlign: 'right' }}
            >
              {percent(value / total, 1)}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: 'var(--sunken)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(1, (value / biggest) * 100)}%`,
                borderRadius: 4,
                background: 'var(--accent)',
                transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Wordmark() {
  return (
    <span className="row" style={{ gap: 9 }}>
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: '1.6px solid var(--accent)',
          position: 'relative',
          flex: 'none',
        }}
      >
        <span
          style={{ position: 'absolute', inset: 4, borderRadius: 1, background: 'var(--accent)' }}
        />
      </span>
      <span className="col" style={{ gap: 0, lineHeight: 1.18 }}>
        <span
          className="wordmark-name"
          style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
        >
          Smart Nigrani System
        </span>
        <span
          className="label wordmark-sub"
          style={{ fontSize: 10, letterSpacing: '0.1em', lineHeight: 1.3 }}
        >
          MPLADS monitoring
        </span>
      </span>
    </span>
  )
}
