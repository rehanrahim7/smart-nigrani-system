/**
 * The research workspace, for an analyst studying the whole dataset.
 *
 *   Overview   the dataset's own totals, what fired, the model card
 *   Works      every work, filterable and sortable by any of the three views
 *   Network    members joined to their most flagged works
 *   Reviews    the analyst's own decisions
 *   Data       dataset history, switching, and importing five new reports
 *   Methods    thresholds and what each output means
 *
 * Presentation mode shows members as aliases on screen for a demonstration;
 * it does not change the data.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAsync, useDebounced } from '../hooks'
import { NetworkScene } from '../components/NetworkScene'
import { RiskBadge } from '../components/Signal'
import { BarList, Stat } from '../components/Charts'
import { count, dateTime, inr, inrFull, properName } from '../format'
import { href, navigate, setParams, useRoute, workHref } from '../router'
import { setPresenting, usePresenting } from '../presentation'
import type { DatasetEntry } from '../types'

type Tab = 'overview' | 'works' | 'network' | 'reviews' | 'data' | 'methods'
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['works', 'Works'],
  ['network', 'Network'],
  ['reviews', 'My reviews'],
  ['data', 'Data'],
  ['methods', 'Methods'],
]

const CHECK_NAMES: Record<string, string> = {
  cost: 'Amount against its group',
  duplicate: 'Similar description',
  timing: 'Days to sanction or age',
  amount: 'Sanction above recommendation',
  payment: 'Payments above sanction',
  quality: 'Date order',
}

export function ResearchWorkspace() {
  const route = useRoute()
  const param = route.params.get('tab') as Tab | null
  const tab: Tab = param && TABS.some(([k]) => k === param) ? param : 'overview'
  const presenting = usePresenting()
  const datasets = useAsync((signal) => api.datasets(signal), [])
  const active = datasets.data?.datasets.find((d) => d.id === datasets.data?.active)

  return (
    <div className="page workspace">
      <header className="research-head rise">
        <div>
          <span className="kicker">Research workspace</span>
          <h1 className="page-title">
            Every work, <em>every reason.</em>
          </h1>
          <p className="dim small">
            {active ? (
              <>
                Dataset: <strong>{active.name}</strong> · snapshot {active.asOf} · {count(active.summary.works)} works
                {active.fourChecks ? '' : ' · four checks not available for imports'}
              </>
            ) : (
              'Loading the dataset'
            )}
          </p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={presenting} onChange={(e) => setPresenting(e.target.checked)} />
          <span>
            Presentation mode
            <small>Show members as aliases on screen. The data itself is unchanged.</small>
          </span>
        </label>
      </header>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams({ tab: key === 'overview' ? null : key }, { replace: false })}
          >
            {label}
          </button>
        ))}
      </nav>

      {datasets.error && <p className="notice notice-error">{datasets.error}</p>}
      {datasets.data && (
        <>
          {tab === 'overview' && <Overview datasetId={datasets.data.active} presenting={presenting} />}
          {tab === 'works' && <WorksTable datasetId={datasets.data.active} presenting={presenting} />}
          {tab === 'network' && <Network datasetId={datasets.data.active} presenting={presenting} />}
          {tab === 'reviews' && <MyReviews datasetId={datasets.data.active} />}
          {tab === 'data' && <Data entries={datasets.data.datasets} active={datasets.data.active} onChanged={datasets.reload} />}
          {tab === 'methods' && <Methods />}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Overview({ datasetId, presenting }: { datasetId: string; presenting: boolean }) {
  const data = useAsync((signal) => api.researchOverview(datasetId, signal), [datasetId])
  const kpis = useAsync((signal) => api.kpis(signal, datasetId), [datasetId])
  const [showAll, setShowAll] = useState(false)
  if (data.loading && !data.data) return <div className="skeleton" style={{ height: 320 }} />
  if (data.error) return <p className="notice notice-error">{data.error}</p>
  if (!data.data) return null
  const s = data.data.summary
  const allocations = [...data.data.allocations].sort((a, b) => (b.allocated ?? 0) - (a.allocated ?? 0))

  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="stat-grid">
        <Stat label="Works after the join" value={count(s.works)} sub={`${count(Object.values(s.counts).reduce((a, b) => a + b, 0))} source rows`} delay={0} />
        <Stat label="Sanctioned" value={count(s.sanctioned)} sub={`${count(s.recommendationsWithoutId)} recommendations without an id`} delay={40} />
        <Stat label="Completion records" value={count(s.completed)} sub={`${count(s.statusDifferences)} disagree with the sanctioned report's stage`} delay={80} />
        <Stat label="With a record check" value={count(s.flagged)} sub={`${count(s.highPriority)} with 40+ rule points`} delay={120} />
        <Stat label="Payments" value={count(s.successfulPayments + s.pendingPayments)} sub={`${count(s.successfulPayments)} successful, ${count(s.pendingPayments)} in progress`} delay={160} />
        <Stat
          label="Four-check review"
          value={kpis.data?.flaggedProjects != null ? count(kpis.data.flaggedProjects) : '-'}
          sub={data.data.meta.fourChecksRun ? `flagged of ${count(data.data.meta.fourChecksRun)} checked` : 'not available for this import'}
          delay={200}
        />
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <span className="label">Money, by scope</span>
          </div>
          <table className="table">
            <tbody>
              {(
                [
                  ['Allocated to members', s.allocated],
                  ['Recommended', s.totalRecommended],
                  ['Sanctioned', s.totalSanctioned],
                  ['Paid, successful', s.paid],
                  ['Payments in progress', s.pending],
                ] as [string, number][]
              ).map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{inrFull(value)}</td>
                  <td className="num faint">{inr(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint small card-pad">
            These totals have different scopes (an allocation, a recommendation, a sanction, a payment), so subtracting one
            from another does not show missing money.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="label">Record checks that fired</span>
          </div>
          <div className="panel-body">
            <BarList
              data={Object.entries(data.data.checkCounts)
                .map(([kind, value]) => ({ name: CHECK_NAMES[kind] ?? kind, value }))
                .sort((a, b) => b.value - a.value)}
              colour="var(--accent)"
            />
          </div>
        </section>
      </div>

      {data.data.model && (
        <section className="panel card-pad">
          <span className="kicker">The model</span>
          <p style={{ margin: '8px 0 4px', lineHeight: 1.65 }}>
            <strong>{data.data.model.model}</strong> ({data.data.model.version}, seed {data.data.model.seed}) trained on{' '}
            {count(data.data.model.trainingRecords)} sanctioned works of the base snapshot, from five inputs:{' '}
            {data.data.model.features.join(', ')}. It scored {count(data.data.meta.scoredByModel ?? 0)} works in this
            dataset.
          </p>
          <p className="faint small">
            {data.data.model.scope} {data.data.model.evaluation}
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Allocated limit per member</span>
          <span className="label mono">{allocations.length}</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Constituency</th>
                <th className="num">Allocated</th>
                <th>Row</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? allocations : allocations.slice(0, 10)).map((row, index) => (
                <tr key={row.row}>
                  <td>{presenting ? `Member ${String(index + 1).padStart(2, '0')}` : properName(row.mp)}</td>
                  <td>{presenting ? '-' : row.constituency}</td>
                  <td className="num">{inr(row.allocated)}</td>
                  <td className="mono faint">{row.row}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allocations.length > 10 && (
          <button className="link card-pad" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show the top 10' : `Show all ${allocations.length}`}
          </button>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function WorksTable({ datasetId, presenting }: { datasetId: string; presenting: boolean }) {
  const route = useRoute()
  const p = route.params
  const risk = p.get('risk') ?? 'all'
  const checks = p.get('checks') ?? 'all'
  const member = p.get('member') ?? 'all'
  const district = p.get('district') ?? 'all'
  const sort = p.get('sort') ?? 'risk'
  const page = Math.max(1, Number(p.get('page')) || 1)
  const [search, setSearch] = useState(p.get('search') ?? '')
  const debounced = useDebounced(search)
  useEffect(() => {
    if ((p.get('search') ?? '') !== debounced) setParams({ search: debounced, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const filters = useAsync((signal) => api.filters(signal, datasetId), [datasetId])
  const list = useAsync(
    (signal) =>
      api.projects({ search: debounced, risk, checks, member, district, sort, page, limit: 15, dataset: datasetId }, signal),
    [debounced, risk, checks, member, district, sort, page, datasetId],
  )
  const set = (key: string) => (value: string) => setParams({ [key]: value, page: null })
  const active = [risk, checks, member, district].filter((v) => v !== 'all').length + (debounced ? 1 : 0)
  const aliasOf = useMemo(() => new Map(list.data?.items.map((i) => [i.mp, i.mpAlias]) ?? []), [list.data])

  return (
    <section className="panel">
      <div className="toolbar research-toolbar">
        <input className="input" placeholder="Search name, village, ID" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" aria-label="Review label" value={risk} onChange={(e) => set('risk')(e.target.value)}>
          <option value="all">Any review label</option>
          <option value="flagged">Flagged by the four checks</option>
          {filters.data?.riskLabels.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Record check" value={checks} onChange={(e) => set('checks')(e.target.value)}>
          <option value="all">Any record check</option>
          <option value="any">At least one record check</option>
          {filters.data?.checkKinds?.map((k) => (
            <option key={k} value={k}>
              {CHECK_NAMES[k] ?? k}
            </option>
          ))}
        </select>
        <select className="select" aria-label="District" value={district} onChange={(e) => set('district')(e.target.value)}>
          <option value="all">All districts</option>
          {filters.data?.districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="select" aria-label="Member" value={member} onChange={(e) => set('member')(e.target.value)}>
          <option value="all">All members</option>
          {filters.data?.members.map((m) => (
            <option key={m} value={m}>
              {presenting ? 'A member (hidden in presentation mode)' : properName(m)}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Order" value={sort} onChange={(e) => set('sort')(e.target.value)}>
          <option value="risk">Four-check priority</option>
          <option value="rules">Record-check points</option>
          <option value="model">Model unusualness</option>
          <option value="amount">Largest amount</option>
          <option value="recent">Most recent sanction</option>
        </select>
        {active > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('')
              navigate(href('/dashboard', { tab: 'works' }))
            }}
          >
            Clear {active}
          </button>
        )}
      </div>

      {list.error && <p className="field-error card-pad">{list.error}</p>}
      {list.data && list.data.items.length === 0 && (
        <div className="empty-state">
          <h3>No works match</h3>
          <p className="dim">Loosen a filter or clear them.</p>
        </div>
      )}
      {list.data && list.data.items.length > 0 && (
        <div className="table-scroll">
          <table className="table works-table">
            <thead>
              <tr>
                <th>Work</th>
                <th>Member</th>
                <th>Four checks</th>
                <th>Record checks</th>
                <th className="num">Model</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item) => (
                <tr key={item.id} className="clickable" onClick={() => navigate(workHref(item.id, datasetId === 'base' ? {} : { dataset: datasetId }))}>
                  <td>
                    <a
                      className="table-work"
                      href={workHref(item.id, datasetId === 'base' ? {} : { dataset: datasetId })}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <b className="clamp-2">{item.name}</b>
                      <small>
                        {item.anonId} · {item.district ?? '-'}
                      </small>
                    </a>
                  </td>
                  <td className="small">{presenting ? item.mpAlias ?? aliasOf.get(item.mp) : properName(item.mp)}</td>
                  <td>{item.riskLabel && <RiskBadge label={item.riskLabel} score={item.fourChecks ? item.riskScore : undefined} />}</td>
                  <td className="small dim">
                    {item.checks && item.checks.length ? (
                      <>
                        <b className="mono">{item.ruleScore}</b> pts · {item.checks.slice(0, 2).join('; ')}
                        {item.checks.length > 2 ? ` +${item.checks.length - 2}` : ''}
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="num">{item.anomaly ? `${item.anomaly.percentile}` : '-'}</td>
                  <td className="num">{inr(item.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && list.data.pages > 1 && (
        <div className="pager">
          <span className="label">
            {count((page - 1) * 15 + 1)}–{count(Math.min(list.data.total, page * 15))} of {count(list.data.total)}
          </span>
          <span className="grow" />
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}>
            Previous
          </button>
          <button className="btn btn-sm" disabled={page >= list.data.pages} onClick={() => setParams({ page: page + 1 })}>
            Next
          </button>
        </div>
      )}
      <p className="faint small card-pad">
        Three separate views of each work: the four-check review priority, the record-check points, and the model's
        percentile. None is a probability of fraud, and they are never added together.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------------ */

function Network({ datasetId, presenting }: { datasetId: string; presenting: boolean }) {
  const [risk, setRisk] = useState('flagged')
  const [paused, setPaused] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const data = useAsync(
    (signal) => api.researchNetwork({ dataset: datasetId, risk: risk === 'all' ? undefined : risk }, signal),
    [datasetId, risk],
  )
  const names = useMemo(() => {
    if (presenting || !data.data) return undefined
    return Object.fromEntries(data.data.members.map((m) => [m.alias, properName(m.name ?? m.alias)]))
  }, [data.data, presenting])
  const chosen = data.data?.works.find((w) => w.id === selected)

  return (
    <section className="panel explorer">
      <div className="explorer-tabs">
        <select className="select" style={{ maxWidth: 260 }} aria-label="Which works" value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="flagged">Works flagged by the four checks</option>
          <option value="all">All works</option>
          <option value="Not checked">Works not checked</option>
        </select>
        <span className="grow" />
        <span className="tag">{data.data ? `${count(data.data.total)} works` : '…'}</span>
      </div>
      <NetworkScene
        data={data.data}
        selected={selected}
        onSelect={(w) => setSelected(w.id)}
        paused={paused}
        onPause={() => setPaused((v) => !v)}
        names={names}
      />
      {chosen && (
        <div className="selected-preview">
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="label mono">
              {chosen.anonId} · {presenting ? chosen.mpAlias : names?.[chosen.mpAlias] ?? chosen.mpAlias} · {chosen.district}
            </span>
            <h3 className="clamp-2">{chosen.name}</h3>
          </div>
          <a className="btn btn-primary" href={workHref(chosen.id, datasetId === 'base' ? {} : { dataset: datasetId })}>
            Open →
          </a>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------------ */

function MyReviews({ datasetId }: { datasetId: string }) {
  const data = useAsync((signal) => api.myReviews(datasetId, signal), [datasetId])
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Your decisions in this dataset</span>
        <span className="label mono">{data.data?.items.length ?? ''}</span>
      </div>
      {data.error && <p className="field-error card-pad">{data.error}</p>}
      {data.data && data.data.items.length === 0 && (
        <p className="faint card-pad">
          No decisions yet. Open any work and use its Reviews tab. Decisions are private to your account and never deleted.
        </p>
      )}
      <ol className="history">
        {data.data?.items.map((item) => (
          <li key={item.id}>
            <a className="link" href={workHref(item.projectId, { tab: 'reviews', ...(datasetId === 'base' ? {} : { dataset: datasetId }) })}>
              {item.projectRef} · {item.projectName}
            </a>
            <strong>{item.decision}</strong>
            <small>{dateTime(item.createdAt)}</small>
            <p>{item.note}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------------ */

const REPORT_NAMES = [
  'Works Recommended',
  'Works Sanctioned',
  'Works Completed',
  'Expenditure on Completed and On-going Works as on Date',
  'Allocated Limit for Honble MPs',
]

function Data({ entries, active, onChanged }: { entries: DatasetEntry[]; active: string; onChanged: () => void }) {
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(id: string) {
    setSwitching(id)
    setError(null)
    try {
      await api.chooseDataset(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div className="two-col">
      <section className="panel">
        <div className="panel-head">
          <span className="label">Datasets</span>
          <span className="label mono">{entries.length}</span>
        </div>
        {error && <p className="field-error card-pad">{error}</p>}
        <ul className="dataset-list">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.id === active ? 'active' : ''}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{entry.name}</strong>
                <small>
                  Snapshot {entry.asOf} · {count(entry.summary.works)} works · {count(entry.summary.sanctioned)} sanctioned ·{' '}
                  {entry.shared ? 'shared, the base every account uses' : `imported ${dateTime(entry.createdAt)}`}
                </small>
                {!entry.fourChecks && <small className="faint">Four checks not available: they come from the team's offline detector pipeline.</small>}
              </div>
              {entry.id === active ? (
                <span className="tag tag-ok">In use</span>
              ) : (
                <button className="btn btn-sm" onClick={() => choose(entry.id)} disabled={switching !== null}>
                  {switching === entry.id ? 'Switching' : 'Use this'}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="faint small card-pad">
          Nothing is overwritten or deleted. Each import is kept as its own dataset, and the base snapshot always stays.
        </p>
      </section>
      <ImportForm onImported={onChanged} />
    </div>
  )
}

function ImportForm({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [asOf, setAsOf] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const size = files.reduce((sum, f) => sum + f.size, 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)
    if (files.length !== 5) return setError(`Choose exactly five CSV files, one of each report. You have chosen ${files.length}.`)
    if (size > 12 * 1024 * 1024) return setError('The five files together must be under 12 MB')
    if (!asOf) return setError('Enter the date the reports were exported (the snapshot date)')
    setBusy(true)
    try {
      const payload = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })))
      const imported = await api.importDataset({ asOf, name: name.trim() || undefined, files: payload })
      setResult(
        `Imported "${imported.name}": ${count(imported.summary.works)} works, ${count(imported.summary.sanctioned)} sanctioned, ${count(
          imported.meta.scoredByModel ?? 0,
        )} scored by the model, ${count(imported.summary.flagged)} with a record check. It is now the dataset in use.`,
      )
      setFiles([])
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed. Nothing was saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel card-pad col" style={{ gap: 12 }} onSubmit={submit}>
      <span className="kicker">Import a newer export</span>
      <h3 className="serif card-title">Five reports, analysed the same way</h3>
      <p className="dim small">
        Upload one CSV of each report exported from the MPLADS portal for Maharashtra:
      </p>
      <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
        {REPORT_NAMES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <label className="field">
        <span className="label">The five CSV files</span>
        <input
          className="input"
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <small className="faint">
            {files.length} file{files.length === 1 ? '' : 's'}, {(size / 1024 / 1024).toFixed(1)} MB
          </small>
        )}
      </label>
      <label className="field">
        <span className="label">Snapshot date (when the reports were exported)</span>
        <input className="input mono" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Name (optional)</span>
        <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="October export" />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {result && <p className="notice notice-ok" role="status">{result}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy && <span className="spinner" />}
        {busy ? 'Checking and analysing' : 'Import'}
      </button>
      <p className="faint small">
        Files are checked by their columns, not their names: one of each report, Maharashtra rows only, dates as
        DD-Mon-YYYY, no repeated work ids, known payment statuses, up to 15,000 rows. The join, the seven record checks
        and the model are applied. The four checks come from the team's offline pipeline and are not run on imports.
      </p>
    </form>
  )
}

/* ------------------------------------------------------------------------ */

function Methods() {
  return (
    <div className="two-col">
      <section className="panel card-pad">
        <span className="kicker">Three views, never mixed</span>
        <ul className="plain-steps">
          <li>
            <strong>Four-check review priority.</strong> The team's detectors for cost, repeated work, time taken and
            money against progress, weighted 30/25/25/20 with 5 points per flag (up to three). Critical 75+, High 55+,
            Medium 35+.
          </li>
          <li>
            <strong>Seven record checks.</strong> In-app rules on the joined records, each worth points for ordering in
            this table only (25 amount, 25 description, 12 or 20 timing, 15 amount change, 20 payments, 15 date order).
          </li>
          <li>
            <strong>Isolation Forest percentile.</strong> Statistical unusualness among the 2,437 sanctioned works it was
            trained on. No labels exist, so it has no accuracy figure.
          </li>
        </ul>
        <a className="link" href="#/how-it-works">
          The full explanation, with diagrams →
        </a>
      </section>
      <section className="panel card-pad">
        <span className="kicker">What the data cannot tell you</span>
        <ul className="limits">
          <li>No coordinates: map positions are district centres.</li>
          <li>No quantities or specifications: amount comparisons are totals, not unit costs.</li>
          <li>No progress figures: progress comes only from what the delivery team reports.</li>
          <li>No transaction ids: a repeated payment cannot be told from a second instalment.</li>
          <li>A missing completion record does not prove a work is unfinished.</li>
          <li>No confirmed cases of fraud exist here, so nothing is, or could be, a fraud prediction.</li>
        </ul>
      </section>
    </div>
  )
}
