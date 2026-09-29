/**
 * Review decisions and follow-up actions.
 *
 * Two kinds, both append-only (a changed mind is a new entry, so the history
 * of who decided what is never lost):
 *
 * * A decision on the whole work, by the member or an analyst: Needs
 *   documents, Inspection required, Explained, Review in progress. It stays
 *   with the person who wrote it.
 * * An action on one submission (a work log entry or a photograph), by the
 *   member or the agency: Request clarification, Request site visit, Evidence
 *   reviewed, Escalate to authority. The whole team sees these, so the
 *   contractor knows what was asked.
 *
 * Nothing here sends a message to anyone outside the system.
 */

import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useDraft } from '../../hooks'
import { ROLE_NAME, dateTime, newId } from '../../format'
import type { ProjectDetail, Review } from '../../types'

export const WORK_DECISIONS = ['Needs documents', 'Inspection required', 'Explained', 'Review in progress']
export const SUBMISSION_ACTIONS = ['Request clarification', 'Request site visit', 'Evidence reviewed', 'Escalate to authority']

export function ReviewsTab({
  project,
  dataset,
  onChanged,
}: {
  project: ProjectDetail
  dataset?: string
  onChanged: () => void
}) {
  const { user } = useAuth()
  const decides = user?.role === 'mp' || user?.role === 'analyst'
  const decisions = project.reviews.filter((r) => r.targetKind === 'work')
  const actions = project.reviews.filter((r) => r.targetKind !== 'work')

  return (
    <div className="review-layout">
      <div className="col" style={{ gap: 16 }}>
        {decides && <DecisionForm project={project} dataset={dataset} onSaved={onChanged} />}
        {!decides && (
          <p className="notice">
            {user?.role === 'agency'
              ? 'Act on individual submissions from the Work log and Field evidence tabs. Every action appears below.'
              : 'Actions the member or agency took on your submissions appear below. Decisions on the work as a whole are kept by the reviewer who made them.'}
          </p>
        )}

        {decides && (
          <section className="panel">
            <div className="panel-head">
              <span className="label">Your decisions on this work</span>
              <span className="label mono">{decisions.length}</span>
            </div>
            <History items={decisions} empty="No decision recorded yet." />
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Actions on submissions</span>
          <span className="label mono">{actions.length}</span>
        </div>
        <History items={actions} empty="No action has been taken on a submission for this work." showTarget />
      </section>
    </div>
  )
}

function DecisionForm({ project, dataset, onSaved }: { project: ProjectDetail; dataset?: string; onSaved: () => void }) {
  const [draft, setDraft, clear, restored] = useDraft(`decision.${dataset ?? 'base'}.${project.id}`, () => ({
    clientId: newId(),
    decision: '',
    note: '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(null)
    if (!draft.decision) return setError('Choose a decision')
    if (draft.note.trim().length < 5) return setError('Write at least a short reason (5 characters or more)')
    setBusy(true)
    try {
      await api.addReview(project.id, {
        clientId: draft.clientId,
        targetKind: 'work',
        decision: draft.decision,
        note: draft.note.trim(),
        dataset,
      })
      setSaved(draft.decision)
      clear()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Your note is kept; try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel card-pad col" style={{ gap: 12 }} onSubmit={submit}>
      <span className="kicker">Your review</span>
      <h3 className="serif card-title">Record a decision on this work</h3>
      {restored && <p className="info small">Your unsaved note was restored.</p>}
      <div className="choice-grid" role="radiogroup" aria-label="Decision">
        {WORK_DECISIONS.map((decision) => (
          <label key={decision} className={`choice ${draft.decision === decision ? 'active' : ''}`}>
            <input
              type="radio"
              name="decision"
              value={decision}
              checked={draft.decision === decision}
              onChange={() => setDraft((d) => ({ ...d, decision }))}
            />
            {decision}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="label">Reason</span>
        <textarea
          className="input"
          rows={4}
          maxLength={3000}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder="What you looked at, and what should happen next"
        />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {saved && <p className="notice notice-ok" role="status">Saved: {saved}.</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving' : 'Save decision'}
        </button>
        <span className="faint small">Kept with your account. Nothing is sent to anyone.</span>
      </div>
    </form>
  )
}

function History({ items, empty, showTarget = false }: { items: Review[]; empty: string; showTarget?: boolean }) {
  if (items.length === 0) return <p className="faint card-pad">{empty}</p>
  return (
    <ol className="history">
      {[...items].reverse().map((item) => (
        <li key={item.id}>
          <strong>{item.decision}</strong>
          <small>
            {item.createdByName} · {ROLE_NAME[item.role]} · {dateTime(item.createdAt)}
            {showTarget && item.targetKind !== 'work' ? ` · on a ${item.targetKind === 'worklog' ? 'work log entry' : 'photograph'}` : ''}
          </small>
          <p>{item.note}</p>
        </li>
      ))}
    </ol>
  )
}

/** The actions taken on one submission, shown under it. */
export function ReviewTrail({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null
  return (
    <ul className="review-trail">
      {reviews.map((r) => (
        <li key={r.id}>
          <b>{r.decision}</b> · {r.createdByName}, {dateTime(r.createdAt)}: {r.note}
        </li>
      ))}
    </ul>
  )
}

/** "Act on this" for one submission, for the member and the agency. */
export function ReviewInline({
  projectId,
  targetKind,
  targetId,
  onSaved,
}: {
  projectId: string
  targetKind: 'worklog' | 'evidence'
  targetId: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft, clear] = useDraft(`action.${targetKind}.${targetId}`, () => ({
    clientId: newId(),
    decision: SUBMISSION_ACTIONS[0],
    note: '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (draft.note.trim().length < 5) return setError('Add a short note (5 characters or more)')
    setBusy(true)
    try {
      await api.addReview(projectId, {
        clientId: draft.clientId,
        targetKind,
        targetId,
        decision: draft.decision,
        note: draft.note.trim(),
      })
      clear()
      setOpen(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Your note is kept; try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Act on this
      </button>
    )
  }

  return (
    <form className="inline-review col" style={{ gap: 6 }} onSubmit={submit}>
      <select
        className="select"
        aria-label="Action"
        value={draft.decision}
        onChange={(e) => setDraft((d) => ({ ...d, decision: e.target.value }))}
      >
        {SUBMISSION_ACTIONS.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
      <textarea
        className="input"
        rows={2}
        aria-label="Note"
        placeholder="What you need, and why"
        value={draft.note}
        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
      />
      {error && <span className="field-error small">{error}</span>}
      <div className="row" style={{ gap: 6 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
