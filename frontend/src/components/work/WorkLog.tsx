/**
 * The work log: the Sr No / Work / Cost / Date table from the brief, now able
 * to hold itemised material claims.
 *
 * A contractor adds entries. Everyone on the team reads them; the member and
 * the agency can act on any entry (ask for clarification, a site visit, and
 * so on). The draft form is kept in the browser session, so a failed save, a
 * page change or a refresh never loses what was typed, and each draft carries
 * one id so pressing Save twice records it once.
 */

import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useDraft } from '../../hooks'
import { count, date as fmtDate, dateTime, inr, inrFull, newId, todayIso } from '../../format'
import { Empty } from '../Charts'
import { ReviewInline, ReviewTrail } from './Reviews'
import type { ExpenseItem, ProjectDetail, WorkLog } from '../../types'

export const STAGES = ['Planning', 'Foundation', 'Construction', 'Finishing', 'Completed']

export function WorkLogTab({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const { user } = useAuth()
  const canAdd = user?.role === 'vendor'
  const canAct = user?.role === 'mp' || user?.role === 'agency'
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<{ text: string; flags: string[] } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const works = project.works
  const logged = works.reduce((sum, w) => sum + w.cost, 0)
  const budget = project.budget ?? 0
  const over = budget > 0 && logged > budget

  async function remove(entry: WorkLog) {
    setRemoving(entry.id)
    setRemoveError(null)
    try {
      await api.deleteWork(project.id, entry.id)
      onChanged()
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Could not remove the entry')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel card-pad">
        <div className="row wrap" style={{ gap: 24 }}>
          <Figure label="Approved budget" value={inr(project.budget)} />
          <Figure label="Paid so far (reports)" value={inr(project.totalPaid)} />
          <Figure label="Entered by the contractor" value={inr(logged)} tone={over ? 'var(--critical)' : undefined} />
          {canAdd && (
            <div className="grow row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
                {open ? 'Close the form' : '+ Add an entry'}
              </button>
            </div>
          )}
        </div>
        {over && (
          <p className="warn-text small" style={{ marginTop: 10 }}>
            The entries add up to {inr(logged - budget)} more than the approved budget.{' '}
            {canAdd
              ? 'Everything you entered is saved. Check the amounts if that looks wrong.'
              : 'It is recorded rather than blocked, because showing it is the point.'}
          </p>
        )}
      </div>

      {notice && (
        <div className="notice notice-ok" role="status">
          <strong>{notice.text}</strong>
          {notice.flags.length > 0 && (
            <>
              <p style={{ margin: '6px 0 4px' }}>The system noted these for review. The entry is saved either way:</p>
              <ul>
                {notice.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {canAdd && open && (
        <EntryForm
          project={project}
          onSaved={(entry) => {
            setOpen(false)
            setNotice({ text: `Saved: ${entry.work}, ${inrFull(entry.cost)}.`, flags: entry.flags ?? [] })
            onChanged()
          }}
        />
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Work recorded</span>
          <span className="label mono">{count(works.length)}</span>
        </div>

        {removeError && <p className="field-error card-pad">{removeError}</p>}

        {works.length === 0 ? (
          <div style={{ padding: '26px 16px' }}>
            <Empty>
              {canAdd
                ? 'Nothing recorded yet. Use "Add an entry" to record the first materials or work done.'
                : 'The contractor has not entered any work for this project yet.'}
            </Empty>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Sr No</th>
                  <th>Work</th>
                  <th className="num" style={{ width: 120 }}>
                    Cost
                  </th>
                  <th style={{ width: 118 }}>Date</th>
                  {(canAdd || canAct) && <th style={{ width: 150 }} aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {works.map((row) => {
                  const reviews = project.reviews.filter((r) => r.targetKind === 'worklog' && r.targetId === row.id)
                  return (
                    <tr key={row.id}>
                      <td className="mono faint">{row.srNo}.</td>
                      <td>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{row.work}</div>
                        <div className="faint small" style={{ marginTop: 2 }}>
                          {row.createdByName} · {dateTime(row.createdAt)}
                          {row.stage ? ` · stage ${row.stage}` : ''}
                          {row.progress != null ? ` · ${row.progress}% reported` : ''}
                        </div>
                        {row.note && <div className="dim small" style={{ marginTop: 3 }}>{row.note}</div>}
                        {row.items && row.items.length > 0 && <ItemTable items={row.items} />}
                        {row.flags && row.flags.length > 0 && (
                          <ul className="flag-list">
                            {row.flags.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        )}
                        <ReviewTrail reviews={reviews} />
                      </td>
                      <td className="num" title={inrFull(row.cost)}>
                        {inr(row.cost)}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {fmtDate(row.date)}
                      </td>
                      {(canAdd || canAct) && (
                        <td>
                          {canAdd && row.createdBy === user?.username && reviews.length === 0 && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => remove(row)}
                              disabled={removing === row.id}
                              title="Remove a mistaken entry. Not possible once it has been reviewed."
                            >
                              {removing === row.id ? 'Removing' : 'Remove'}
                            </button>
                          )}
                          {canAct && (
                            <ReviewInline projectId={project.id} targetKind="worklog" targetId={row.id} onSaved={onChanged} />
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td className="label">Total</td>
                  <td className="num" style={{ fontWeight: 600, color: over ? 'var(--critical)' : undefined }}>
                    {inr(logged)}
                  </td>
                  <td />
                  {(canAdd || canAct) && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ItemTable({ items }: { items: ExpenseItem[] }) {
  return (
    <details className="items-detail">
      <summary>{items.length} material line{items.length === 1 ? '' : 's'}</summary>
      <table className="table compact">
        <thead>
          <tr>
            <th>Material</th>
            <th>Unit</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th>Invoice</th>
            <th className="num">Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td>{item.material}</td>
              <td>{item.unit}</td>
              <td className="num">{item.quantity.toLocaleString('en-IN')}</td>
              <td className="num">₹{item.rate.toLocaleString('en-IN')}</td>
              <td className="mono">{item.invoice}</td>
              <td className="num">{inrFull(item.total ?? item.quantity * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

interface ItemDraft {
  material: string
  unit: string
  quantity: string
  rate: string
  invoice: string
}

interface EntryDraft {
  clientId: string
  mode: 'items' | 'single'
  work: string
  date: string
  stage: string
  progress: string
  note: string
  cost: string
  items: ItemDraft[]
}

const EMPTY_ITEM: ItemDraft = { material: '', unit: '', quantity: '', rate: '', invoice: '' }

function EntryForm({ project, onSaved }: { project: ProjectDetail; onSaved: (entry: WorkLog) => void }) {
  const [draft, setDraft, clearDraft, restored] = useDraft<EntryDraft>(`worklog.${project.id}`, () => ({
    clientId: newId(),
    mode: 'items',
    work: '',
    date: todayIso(),
    stage: 'Construction',
    progress: '',
    note: '',
    cost: '',
    items: [{ ...EMPTY_ITEM }],
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setItem = (index: number, key: keyof ItemDraft, value: string) =>
    setDraft((d) => ({ ...d, items: d.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)) }))

  const preview = draft.items.reduce((sum, item) => {
    const q = Number(item.quantity)
    const r = Number(item.rate)
    return Number.isFinite(q) && Number.isFinite(r) ? sum + q * r : sum
  }, 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)

    const progress = draft.progress === '' ? undefined : Number(draft.progress)
    if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
      setError('Reported progress is a whole number from 0 to 100')
      return
    }

    let items: ExpenseItem[] | undefined
    let cost: number | undefined
    if (draft.mode === 'items') {
      items = []
      for (const [index, item] of draft.items.entries()) {
        const quantity = Number(item.quantity)
        const rate = Number(item.rate)
        if (!item.material.trim() || !item.unit.trim() || !item.invoice.trim()) {
          setError(`Line ${index + 1}: fill in the material, unit and invoice number`)
          return
        }
        if (!(quantity > 0) || !(rate > 0)) {
          setError(`Line ${index + 1}: quantity and rate must be greater than zero`)
          return
        }
        items.push({ material: item.material.trim(), unit: item.unit.trim(), quantity, rate, invoice: item.invoice.trim() })
      }
    } else {
      cost = Number(draft.cost)
      if (!Number.isFinite(cost) || cost <= 0) {
        setError('Enter a cost greater than zero')
        return
      }
    }

    setBusy(true)
    try {
      const entry = await api.addWorkItems(project.id, {
        clientId: draft.clientId,
        work: draft.work.trim(),
        date: draft.date,
        note: draft.note.trim() || null,
        stage: draft.stage || undefined,
        progress,
        items,
        cost,
      })
      clearDraft()
      onSaved(entry)
    } catch (err) {
      // The draft, including its id, stays as it is, so Save can simply be
      // pressed again and the server will not record it twice.
      setError(err instanceof Error ? err.message : 'Could not save. Your entry is kept; try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="panel card-pad entry-form rise">
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
        <h3 className="serif card-title">Add a work log entry</h3>
        <div className="segmented" role="radiogroup" aria-label="Kind of entry">
          <button type="button" role="radio" aria-checked={draft.mode === 'items'} className={draft.mode === 'items' ? 'active' : ''} onClick={() => set('mode', 'items')}>
            Itemised materials
          </button>
          <button type="button" role="radio" aria-checked={draft.mode === 'single'} className={draft.mode === 'single' ? 'active' : ''} onClick={() => set('mode', 'single')}>
            Single amount
          </button>
        </div>
      </div>
      {restored && <p className="info small">Your unsaved draft was restored.</p>}

      <div className="form-grid">
        <label className="field span-2">
          <span className="label">What was done or bought</span>
          <input className="input" value={draft.work} onChange={(e) => set('work', e.target.value)} placeholder="Foundation materials, first lot" required maxLength={200} />
        </label>
        <label className="field">
          <span className="label">Date</span>
          <input className="input mono" type="date" value={draft.date} max={todayIso()} onChange={(e) => set('date', e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">Stage of the work</span>
          <select className="select" value={draft.stage} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Progress you report (%)</span>
          <input className="input mono" type="number" inputMode="numeric" min={0} max={100} step={1} value={draft.progress} onChange={(e) => set('progress', e.target.value)} placeholder="optional" />
        </label>
        {draft.mode === 'single' && (
          <label className="field">
            <span className="label">Cost (₹)</span>
            <input className="input mono" type="number" inputMode="numeric" min={1} step={1} value={draft.cost} onChange={(e) => set('cost', e.target.value)} placeholder="300000" required />
          </label>
        )}
      </div>

      {draft.mode === 'items' && (
        <div className="items-editor">
          <div className="items-head" aria-hidden="true">
            <span>Material</span>
            <span>Unit / specification</span>
            <span>Quantity</span>
            <span>Rate (₹ per unit)</span>
            <span>Invoice no.</span>
            <span>Line total</span>
            <span />
          </div>
          {draft.items.map((item, index) => {
            const q = Number(item.quantity)
            const r = Number(item.rate)
            const line = q > 0 && r > 0 ? q * r : null
            return (
              <div className="items-row" key={index}>
                <input className="input" aria-label={`Line ${index + 1} material`} value={item.material} onChange={(e) => setItem(index, 'material', e.target.value)} placeholder="Cement" maxLength={200} />
                <input className="input" aria-label={`Line ${index + 1} unit`} value={item.unit} onChange={(e) => setItem(index, 'unit', e.target.value)} placeholder="50 kg bag" maxLength={60} />
                <input className="input mono" aria-label={`Line ${index + 1} quantity`} type="number" inputMode="decimal" min={0} step="any" value={item.quantity} onChange={(e) => setItem(index, 'quantity', e.target.value)} placeholder="100" />
                <input className="input mono" aria-label={`Line ${index + 1} rate`} type="number" inputMode="decimal" min={0} step="any" value={item.rate} onChange={(e) => setItem(index, 'rate', e.target.value)} placeholder="420" />
                <input className="input mono" aria-label={`Line ${index + 1} invoice`} value={item.invoice} onChange={(e) => setItem(index, 'invoice', e.target.value)} placeholder="INV-204" maxLength={120} />
                <span className="mono line-total">{line !== null ? inrFull(line) : '-'}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={draft.items.length === 1}
                  onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}
                >
                  ✕
                </button>
              </div>
            )
          })}
          <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={draft.items.length >= 30}
              onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { ...EMPTY_ITEM }] }))}
            >
              + Add a line
            </button>
            <span className="grow" />
            <span className="small">
              Preview total <strong className="mono">{inrFull(preview)}</strong>
              <span className="faint"> · the server works out the saved total</span>
            </span>
          </div>
        </div>
      )}

      <label className="field">
        <span className="label">Note (optional)</span>
        <input className="input" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Supplier, delivery details, anything useful" maxLength={500} />
      </label>

      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}

      <div className="row wrap" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving' : 'Save entry'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={clearDraft} disabled={busy}>
          Clear the form
        </button>
        <span className="faint small">These are claims you record. They are not verified payments.</span>
      </div>
    </form>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 3, color: tone }}>
        {value}
      </div>
    </div>
  )
}
