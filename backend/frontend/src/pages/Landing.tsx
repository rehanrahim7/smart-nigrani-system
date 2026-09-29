/**
 * The public front page.
 *
 * Layout from the first version of the site: a headline and number rail on
 * the left, the network or the map in the middle, and a filter rail on the
 * right with an explicit Apply button. Everything on it is the real 2026-09-09
 * snapshot. Members appear as aliases (MP 01 to MP 47), because this page is
 * open to anyone and a flag beside a named person is not something the
 * system needs to publish.
 *
 * Every number is read from the API. Nothing is typed in by hand, so nothing
 * can quietly go out of date.
 */

import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import { api, offlineHelp } from '../api'
import { useAsync } from '../hooks'
import { NetworkScene } from '../components/NetworkScene'
import { RiskBadge, SignalMeter } from '../components/Signal'
import { SIGNAL_COLOR, count, inr, percent } from '../format'
import { href, navigate, setParams, useRoute, workHref } from '../router'

// Loaded only when needed, so the mapping library never delays the first
// paint of the text above it.
const HeroMap = lazy(() => import('../components/HeroMap').then((m) => ({ default: m.HeroMap })))

const CHECKS = [
  {
    key: 'cost' as const,
    heading: 'Cost against similar works',
    body: 'Finds works that cost far more than other works with similar descriptions in the same period.',
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

export function Landing() {
  const route = useRoute()
  const meta = useAsync(() => api.meta(), [])
  const highlights = useAsync(() => api.highlights(3), [])
  const filters = useAsync((signal) => api.publicFilters(signal), [])

  // The rail's choices. They re-draw the network straight away; Apply takes
  // them to the full register.
  const [search, setSearch] = useState(route.params.get('search') ?? '')
  const [district, setDistrict] = useState(route.params.get('district') ?? 'all')
  const [sector, setSector] = useState(route.params.get('sector') ?? 'all')
  const [risk, setRisk] = useState(route.params.get('risk') ?? 'all')
  const [view, setView] = useState<'network' | 'map'>(route.params.get('view') === 'map' ? 'map' : 'network')
  const [paused, setPaused] = useState(false)

  const network = useAsync(
    (signal) => api.network({ district, sector, risk: risk === 'all' ? undefined : risk }, signal),
    [district, sector, risk],
  )

  // The selected work lives in the address, so coming back from a work page
  // lands on the same selection.
  const selectedId = route.params.get('work')
  const selected = useMemo(() => {
    const works = network.data?.works ?? []
    return works.find((w) => w.id === selectedId) ?? works[0] ?? null
  }, [network.data, selectedId])

  const offline = Boolean(meta.error)
  const help = offlineHelp()

  function apply(event?: FormEvent) {
    event?.preventDefault()
    navigate(href('/works', { search: search.trim(), district, sector, risk }))
  }

  function reset() {
    setSearch('')
    setDistrict('all')
    setSector('all')
    setRisk('all')
  }

  const flagged = meta.data
    ? (meta.data.labelCounts['Critical Review'] ?? 0) +
      (meta.data.labelCounts['High Review'] ?? 0) +
      (meta.data.labelCounts['Medium Review'] ?? 0)
    : null

  return (
    <div className="landing">
      {offline && (
        <div className="notice notice-error" role="alert">
          <strong>{help.title}</strong>
          <ol>
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* ================= three columns ================= */}
      <div className="landing-grid">
        <aside className="landing-intro rise">
          <span className="kicker">MPLADS public works · Maharashtra</span>
          <h1 className="display">
            {meta.data ? count(meta.data.totalProjects) : '4,798'} public works.
            <br />
            <em>{flagged !== null ? count(flagged) : '264'} worth a closer look.</em>
          </h1>
          <p className="dim">
            Nobody can inspect every work by hand. This system reads the public record, runs its checks on each
            work, and puts the unusual ones first, each with a sentence saying why.
          </p>

          <ul className="landing-metrics">
            {(
              [
                [meta.data ? count(meta.data.totalProjects) : '-', 'works in the record', 'Every recommendation and sanction'],
                [meta.data ? count(meta.data.members) : '-', 'members of parliament', 'Shown here as MP 01 to MP 47'],
                [meta.data ? count(meta.data.districts) : '-', 'districts', 'Positions are district-level'],
                [meta.data ? count(meta.data.scoredByModel) : '-', 'works the model scored', 'Unusualness, not a verdict'],
              ] as [string, string, string][]
            ).map(([value, label, sub], index) => (
              <li key={label} className="rise" style={{ animationDelay: `${80 + index * 60}ms` }}>
                <strong className="mono">{value}</strong>
                <span>
                  {label}
                  <small>{sub}</small>
                </span>
              </li>
            ))}
          </ul>

          <p className="intro-foot">
            <ShieldIcon />
            <span>
              Review signals, not verdicts.
              <br />
              Evidence before conclusions.
            </span>
          </p>
        </aside>

        <section className="panel explorer rise" style={{ animationDelay: '120ms' }}>
          <div className="explorer-tabs" role="tablist" aria-label="Explorer view">
            <button role="tab" aria-selected={view === 'network'} className={view === 'network' ? 'active' : ''} onClick={() => setView('network')}>
              Recommendation network
            </button>
            <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
              Map of every work
            </button>
            <span className="grow" />
            <span className="tag">{network.data ? `${count(network.data.total)} works` : '…'}</span>
          </div>

          {view === 'network' ? (
            <NetworkScene
              data={network.data}
              selected={selected?.id ?? null}
              onSelect={(work) => setParams({ work: work.id })}
              paused={paused}
              onPause={() => setPaused((v) => !v)}
            />
          ) : (
            <div style={{ padding: 14 }}>
              <Suspense fallback={<div className="skeleton" style={{ aspectRatio: '10 / 8' }} />}>
                <HeroMap onOpen={() => navigate('#/works')} />
              </Suspense>
            </div>
          )}

          {network.error && <p className="field-error" style={{ padding: '0 18px 12px' }}>{network.error}</p>}

          {selected && (
            <div className="selected-preview">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8, marginBottom: 4 }}>
                  <RiskBadge label={selected.riskLabel} score={selected.riskLabel === 'Not checked' ? undefined : selected.riskScore} />
                  <span className="label mono">
                    {selected.anonId} · {selected.mpAlias} · {selected.district ?? 'District unknown'}
                  </span>
                </div>
                <h3 className="clamp-2">{selected.name}</h3>
                <small className="faint">
                  {selected.sector} · {inr(selected.budget)}
                </small>
              </div>
              <a className="btn btn-primary" href={workHref(selected.id)}>
                Explore work →
              </a>
            </div>
          )}
        </section>

        <aside className="filter-rail rise" style={{ animationDelay: '180ms' }}>
          <form onSubmit={apply} className="col" style={{ gap: 12 }}>
            <h3 className="rail-heading">Explore your area</h3>
            <label className="field">
              <span className="label">Search works</span>
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Village, kind of work or ID"
              />
            </label>
            <label className="field">
              <span className="label">District</span>
              <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="all">All districts</option>
                {filters.data?.districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Kind of work</span>
              <select className="select" value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="all">All kinds</option>
                {filters.data?.sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Review status</span>
              <select className="select" value={risk} onChange={(e) => setRisk(e.target.value)}>
                <option value="all">All works</option>
                <option value="flagged">Needs a look</option>
                <option value="Critical Review">Critical</option>
                <option value="High Review">High</option>
                <option value="Medium Review">Medium</option>
                <option value="Not checked">Not checked</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Apply filters · view works
            </button>
            <button type="button" className="btn" style={{ width: '100%' }} onClick={reset}>
              Reset filters
            </button>
          </form>

          <div className="rail-note">
            <h3>A fairer lens.</h3>
            <p>Compare a work with works like it before questioning a difference.</p>
            {selected && (
              <a className="link" href={workHref(selected.id, { tab: 'peers' })}>
                See the peer comparison →
              </a>
            )}
          </div>
        </aside>
      </div>

      {/* ================= review journey ================= */}
      <section className="journey">
        <div>
          <span className="kicker">Follow a review journey</span>
          <h2 className="serif">From a signal to a next step.</h2>
        </div>
        {[
          { title: 'Understand the cost', copy: 'Watch the comparison group form, then see where this work sits.', tab: 'peers' },
          { title: 'Trace the timeline', copy: 'Recommendation, sanction, every payment, completion.', tab: 'timeline' },
          { title: 'Verify on the ground', copy: 'Photographs and optional location from the field team.', tab: 'evidence' },
        ].map((step) => (
          <a key={step.title} href={selected ? workHref(selected.id, { tab: step.tab }) : '#/works'}>
            <strong>{step.title}</strong>
            <span>{step.copy}</span>
            <span aria-hidden="true" className="journey-arrow">→</span>
          </a>
        ))}
      </section>

      {/* ================= real findings ================= */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">Real results, not examples</span>
          <h2 className="page-title">
            The three works that most <em>need checking</em>
          </h2>
          <p className="dim">
            Straight from the data, ranked by the same score the dashboards use. The member who recommended each work
            is not shown, because anyone can open this page without signing in.
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
            <a key={item.ref} className="panel finding rise" href={workHref(item.id)} style={{ animationDelay: `${index * 70}ms` }}>
              <div className="row wrap" style={{ gap: 10, marginBottom: 11 }}>
                <RiskBadge label={item.riskLabel} score={item.riskScore} />
                <span className="label mono">{item.ref}</span>
                <span className="grow" />
                <SignalMeter scores={item.scores} width={54} />
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {inr(item.budget)}
                </span>
              </div>
              <h3>{item.name}</h3>
              <p className="faint" style={{ fontSize: 12, margin: '4px 0 12px' }}>
                {item.district} · stage: {item.status}
              </p>
              <ul className="col" style={{ gap: 7, margin: 0, paddingLeft: 17 }}>
                {item.reasons.map((reason) => (
                  <li key={reason.label} className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--text)' }}>{reason.label}:</strong> {reason.explanation}
                  </li>
                ))}
              </ul>
              <span className="link" style={{ marginTop: 12, display: 'inline-block' }}>
                Open the investigation →
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ================= what the money builds ================= */}
      <section className="band band-panel">
        <div className="money-grid">
          <div>
            <div className="band-head">
              <span className="kicker">What the money builds</span>
              <h2 className="page-title">
                Every work, grouped by <em>what it is</em>
              </h2>
              <p className="dim">Roads and community halls are over half of everything in this data.</p>
            </div>
            {meta.loading && <div className="skeleton" style={{ height: 260 }} />}
            {meta.data && <SectorBars counts={meta.data.sectorCounts} />}
            {meta.data?.derivedFields?.sector && (
              <p className="faint" style={{ fontSize: 12, lineHeight: 1.65, marginTop: 18, maxWidth: 720 }}>
                {meta.data.derivedFields.sector}
              </p>
            )}
          </div>
          <figure className="photo-figure">
            <img
              src="/images/maharashtra-road-1400.jpg"
              srcSet="/images/maharashtra-road-700.jpg 700w, /images/maharashtra-road-1400.jpg 1400w"
              sizes="(min-width: 940px) 36vw, 92vw"
              width={1400}
              height={882}
              alt="A surfaced road running through farmland towards hills in rural Maharashtra"
              loading="lazy"
            />
            <figcaption>
              Illustration: a rural road in Maharashtra, not a photograph of any work in this data.{' '}
              <a
                href="https://commons.wikimedia.org/wiki/File:1_India_-_Matheran_-_Bombay_Rural_Road_Monsoons_Mahrashtra.jpg"
                target="_blank"
                rel="noreferrer noopener"
              >
                Photo by McKay Savage, CC BY 2.0
              </a>
              , cropped and colour corrected.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ================= the checks ================= */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">How a work gets flagged</span>
          <h2 className="page-title">
            Four checks, <em>explained</em> on every work
          </h2>
        </div>
        <ol className="checks-list">
          {CHECKS.map((check, index) => (
            <li key={check.key} className="rise" style={{ animationDelay: `${index * 50}ms` }}>
              <span className="row check-marker">
                <span className="check-dot" style={{ background: SIGNAL_COLOR[check.key] }} aria-hidden="true" />
                <span className="mono check-number">{String(index + 1).padStart(2, '0')}</span>
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
        <p className="faint" style={{ fontSize: 13, lineHeight: 1.65, marginTop: 20, maxWidth: 680 }}>
          The four scores combine into one review priority. Separately, seven record checks look for things like a
          sanction far above its recommendation, and a statistical model says how unusual each sanctioned work
          looks. None of these is a finding of wrongdoing.{' '}
          <a className="link" href="#/how-it-works">
            Read how it works →
          </a>
        </p>
      </section>

      {/* ================= limits ================= */}
      <section className="band band-panel">
        <span className="kicker" style={{ marginBottom: 14 }}>
          What this does not do
        </span>
        <ul className="limits">
          {(meta.data?.knownLimits ?? []).map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
          <li>A flag means a person should take a look. It is not a finding, and it does not say anyone did anything wrong.</li>
          <li>The statistical model has never seen a confirmed case of fraud, because none exist in this data. Its score ranks unusualness only.</li>
        </ul>
      </section>

      <footer className="site-footer">
        <span>
          Built from the published MPLADS reports{meta.data ? `, snapshot ${meta.data.snapshot}` : ''}. Review support, not an
          official finding.
        </span>
        <span className="grow" />
        <button type="button" className="link" onClick={() => setPaused((v) => !v)}>
          {paused ? 'Resume motion' : 'Pause motion'}
        </button>
      </footer>
    </div>
  )
}

/**
 * How many works of each kind, as a plain bar list. One colour, because these
 * are slices of one quantity, not different things being compared.
 */
function SectorBars({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts)
  const total = rows.reduce((sum, [, value]) => sum + value, 0)
  const biggest = Math.max(...rows.map(([, value]) => value), 1)

  return (
    <ol className="col" style={{ gap: 12, margin: 0, padding: 0, listStyle: 'none', maxWidth: 900 }}>
      {rows.map(([name, value], index) => (
        <li key={name} className="col rise" style={{ gap: 6, animationDelay: `${index * 35}ms` }}>
          <div className="row" style={{ gap: 10 }}>
            <a className="grow truncate" style={{ fontSize: 14 }} href={href('/works', { sector: name })}>
              {name}
            </a>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {count(value)}
            </span>
            <span className="mono faint" style={{ fontSize: 12, minWidth: 46, textAlign: 'right' }}>
              {percent(value / total, 1)}
            </span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(1, (value / biggest) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.2l2.4 2.3 4.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
