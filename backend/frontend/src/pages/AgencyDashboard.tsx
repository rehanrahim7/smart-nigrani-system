/**
 * The implementing agency's workspace.
 *
 * The agency delivers the member's works: it registers new ones and assigns
 * a contractor and a field officer from its team, adds people to the team,
 * and acts on what the team submits. Like the contractor, it is not sent the
 * review scores; judging the works is the member's and the analyst's job.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useDebounced, useDraft } from '../hooks'
import { Stat } from '../components/Charts'
import { TeamList } from '../components/TeamList'
import { UpdatesFeed } from '../components/UpdatesFeed'
import { count, date as fmtDate, inr, newId, todayIso } from '../format'
import { navigate, setParams, useRoute, workHref } from '../router'

type Tab = 'works' | 'register' | 'submissions' | 'team'
const TABS: [Tab, string][] = [
  ['works', 'Works'],
  ['register', 'Register a work'],
  ['submissions', 'Submissions'],
  ['team', 'Team and access'],
]

export function AgencyDashboard() {
  const { user } = useAuth()
  const route = useRoute()
  const param = route.params.get('tab') as Tab | null
  const tab: Tab = param && TABS.some(([k]) => k === param) ? param : 'works'
  const kpis = useAsync((signal) => api.kpis(signal), [])

  return (
    <div className="page workspace">
      <header className="rise">
        <span className="kicker">Implementing agency</span>
        <h1 className="page-title">{user?.name}</h1>
        {user?.organisation && <p className="faint small">{user.organisation}</p>}
      </header>

      <section className="stat-grid">
        {kpis.loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 78 }} />)}
        {kpis.data && (
          <>
            <Stat label="Works of this team" value={count(kpis.data.totalProjects)} sub={`${count(kpis.data.activeProjects)} still going`} delay={0} />
            <Stat label="Registered here" value={count(kpis.data.registered ?? 0)} sub="new works added by the agency" delay={50} />
            <Stat label="Money approved" value={inr(kpis.data.totalBudget)} sub={`across ${count(kpis.data.districts)} districts`} delay={100} />
            <Stat label="Finished" value={count(kpis.data.completedProjects)} sub="with a completion record" delay={150} />
          </>
        )}
      </section>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams({ tab: key === 'works' ? null : key }, { replace: false })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'works' && <WorksList />}
      {tab === 'register' && <RegisterForm />}
      {tab === 'submissions' && <UpdatesFeed />}
      {tab === 'team' && <TeamList />}
    </div>
  )
}

function WorksList() {
  const route = useRoute()
  const source = route.params.get('source') ?? 'all'
  const page = Math.max(1, Number(route.params.get('page')) || 1)
  const [search, setSearch] = useState(route.params.get('search') ?? '')
  const debounced = useDebounced(search)
  const list = useAsync(
    (signal) => api.projects({ search: debounced, source, sort: 'recent', page, limit: 20 }, signal),
    [debounced, source, page],
  )

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Search works" aria-label="Search works" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" style={{ maxWidth: 230 }} value={source} aria-label="Source" onChange={(e) => setParams({ source: e.target.value, page: null })}>
            <option value="all">MPLADS and registered works</option>
            <option value="mplads">MPLADS report works</option>
            <option value="registered">Registered here</option>
          </select>
        </div>
        <span className="label mono">{list.data ? count(list.data.total) : ''}</span>
      </div>
      {list.error && <p className="field-error card-pad">{list.error}</p>}
      {list.data && list.data.items.length === 0 && (
        <div className="empty-state">
          <h3>No works match</h3>
          <p className="dim">{source === 'registered' ? 'Nothing has been registered yet. Use "Register a work".' : 'Try a shorter search.'}</p>
        </div>
      )}
      <ul className="work-list">
        {list.data?.items.map((item) => (
          <li key={item.id}>
            <a href={workHref(item.id)}>
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="clamp-2">{item.name}</strong>
                <small className="faint">
                  {item.source === 'registered' ? 'Registered · ' : ''}
                  {item.anonId} · {item.district ?? '-'} · {item.status}
                  {item.deadline ? ` · target ${fmtDate(item.deadline)}` : ''}
                  {(item.workEntries ?? 0) > 0 ? ` · ${item.workEntries} log entries` : ''}
                </small>
              </span>
              <span className="mono">{inr(item.budget)}</span>
            </a>
          </li>
        ))}
      </ul>
      {list.data && list.data.pages > 1 && (
        <div className="pager">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}>
            Previous
          </button>
          <span className="label grow" style={{ textAlign: 'center' }}>
            Page {page} of {list.data.pages}
          </span>
          <button className="btn btn-sm" disabled={page >= list.data.pages} onClick={() => setParams({ page: page + 1 })}>
            Next
          </button>
        </div>
      )}
    </section>
  )
}

interface RegisterDraft {
  clientId: string
  title: string
  description: string
  sector: string
  district: string
  budget: string
  sanctioned: string
  deadline: string
  contractor: string
  officer: string
}

function RegisterForm() {
  const team = useAsync((signal) => api.team(signal), [])
  const options = useAsync((signal) => api.publicFilters(signal), [])
  const [draft, setDraft, clear, restored] = useDraft<RegisterDraft>('register', () => ({
    clientId: newId(),
    title: '',
    description: '',
    sector: '',
    district: '',
    budget: '',
    sanctioned: todayIso(),
    deadline: '',
    contractor: '',
    officer: '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)

  const contractors = useMemo(() => team.data?.members.filter((m) => m.role === 'vendor') ?? [], [team.data])
  const officers = useMemo(() => team.data?.members.filter((m) => m.role === 'officer') ?? [], [team.data])
  const set = <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setCreated(null)
    const budget = Number(draft.budget)
    if (!(budget > 0)) return setError('Enter the sanctioned amount in rupees')
    if (!draft.deadline || draft.deadline < draft.sanctioned) return setError('The completion target must be on or after the sanction date')
    setBusy(true)
    try {
      const project = await api.registerProject({
        clientId: draft.clientId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        sector: draft.sector,
        district: draft.district,
        budget,
        sanctioned: draft.sanctioned,
        deadline: draft.deadline,
        contractor: draft.contractor,
        officer: draft.officer,
      })
      clear()
      setCreated({ id: project.id, name: project.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register. Your form is kept; try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="register-layout">
      <form className="panel card-pad col" style={{ gap: 12 }} onSubmit={submit}>
        <span className="kicker">New work</span>
        <h2 className="serif card-title">Register a work and assign it</h2>
        {restored && <p className="info small">Your unsaved form was restored.</p>}
        {created && (
          <div className="notice notice-ok" role="status">
            <strong>Registered: {created.name}.</strong> It is on the member's map and list now, and in the assigned
            contractor's and officer's lists.{' '}
            <a className="link" href={workHref(created.id, { tab: 'timeline' })}>
              Open its timeline →
            </a>
          </div>
        )}
        <div className="form-grid">
          <label className="field span-2">
            <span className="label">Title</span>
            <input className="input" required minLength={3} maxLength={200} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="Community hall roof repair, Bor Ranjani" />
          </label>
          <label className="field span-2">
            <span className="label">Scope of the work</span>
            <textarea className="input" required minLength={10} maxLength={3000} rows={3} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="What will be built or repaired, and where" />
          </label>
          <label className="field">
            <span className="label">Kind of work</span>
            <select className="select" required value={draft.sector} onChange={(e) => set('sector', e.target.value)}>
              <option value="">Choose</option>
              {options.data?.sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">District</span>
            <select className="select" required value={draft.district} onChange={(e) => set('district', e.target.value)}>
              <option value="">Choose</option>
              {options.data?.districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Sanctioned amount (₹)</span>
            <input className="input mono" type="number" inputMode="numeric" min={1} step={1} required value={draft.budget} onChange={(e) => set('budget', e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Sanction date</span>
            <input className="input mono" type="date" required value={draft.sanctioned} onChange={(e) => set('sanctioned', e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Completion target</span>
            <input className="input mono" type="date" required min={draft.sanctioned} value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Contractor</span>
            <select className="select" required value={draft.contractor} onChange={(e) => set('contractor', e.target.value)}>
              <option value="">Choose from your team</option>
              {contractors.map((m) => (
                <option key={m.username} value={m.username}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Field officer</span>
            <select className="select" required value={draft.officer} onChange={(e) => set('officer', e.target.value)}>
              <option value="">Choose from your team</option>
              {officers.map((m) => (
                <option key={m.username} value={m.username}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? 'Registering' : 'Register the work'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={clear} disabled={busy}>
            Clear
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('#/dashboard?tab=team')}>
            Add someone to the team first
          </button>
        </div>
      </form>
      <aside className="panel card-pad">
        <span className="kicker">What happens next</span>
        <ol className="plain-steps">
          <li>The work appears on the member's map and list, marked as registered.</li>
          <li>The contractor and officer you chose see it in their lists; nobody else in their roles does.</li>
          <li>The contractor records materials and work; the officer adds photographs.</li>
          <li>Past the completion target without 100% reported progress, it shows as overdue in the member's updates.</li>
        </ol>
        <p className="faint small">
          Registered works are not given a review priority or a model score. Those were built for the report snapshot,
          and scoring a new work against years-old ones would mislead.
        </p>
      </aside>
    </div>
  )
}
