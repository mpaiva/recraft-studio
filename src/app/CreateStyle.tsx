'use client'

import { useState } from 'react'

export type MakeInfo = { refUnits: number; createUnits: number; maxRefs: number }

type Reference = { file: string; url: string } | { error: string }
type Draft = { draft: string; references: Reference[]; spent: number }

/**
 * Make a style from a description, in two paid steps with a look in between.
 *
 * The references are where the money goes and where a style can go wrong, so
 * they are drawn first and shown back; the style is only made from the ones
 * the person keeps. Every price is on its button before it is pressed.
 */
export function CreateStyle({
  make,
  onCreated,
  onCancel,
}: {
  make: MakeInfo
  onCreated: (key: string, note?: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [count, setCount] = useState(Math.min(3, make.maxRefs))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [kept, setKept] = useState<string[]>([])
  const [busy, setBusy] = useState<'' | 'drawing' | 'making'>('')
  const [error, setError] = useState('')

  const refCost = count * make.refUnits
  const drawn = draft?.references.filter((r): r is { file: string; url: string } => 'file' in r) ?? []

  async function drawReferences() {
    setBusy('drawing')
    setError('')
    try {
      const res = await fetch('/api/styles/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, count }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? `Request failed: ${res.status}`)
      setDraft(data)
      setKept(data.references.filter((r: Reference) => 'file' in r).map((r: { file: string }) => r.file))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy('')
    }
  }

  async function makeStyle() {
    if (!draft) return
    setBusy('making')
    setError('')
    try {
      const res = await fetch('/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: draft.draft, files: kept, name, description }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? `Request failed: ${res.status}`)
      onCreated(data.key, data.sample === 'saved' ? undefined : `The style was made, but its sample was not: ${data.sample}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy('')
    }
  }

  const describing = !draft
  const ready = name.trim() && description.trim().length >= 10

  return (
    <div className="picker-body create">
      <label htmlFor="style-name">
        Name <span className="hint">— how it will appear in the style list</span>
      </label>
      <input
        id="style-name"
        type="text"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Mid-century print"
      />

      <div style={{ height: 14 }} />

      <label htmlFor="style-description">
        Description <span className="hint">— the look, not the subject: line, shape, texture, mood, era</span>
      </label>
      <textarea
        id="style-description"
        rows={4}
        maxLength={600}
        value={description}
        disabled={!describing}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Flat mid-century shapes with thick black outlines, a grainy paper texture, and slightly off-register color, like a 1960s screen print."
      />

      {describing ? (
        <>
          <div style={{ height: 14 }} />
          <div style={{ maxWidth: 320 }}>
            <label htmlFor="style-refs">
              References <span className="hint">— more hold the look more tightly</span>
            </label>
            <select id="style-refs" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: make.maxRefs }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} reference{n === 1 ? '' : 's'} · {n * make.refUnits} units
                </option>
              ))}
            </select>
          </div>

          <p className="hint create-cost">
            Recraft makes styles from images, not words, so the description is drawn {count} time
            {count === 1 ? '' : 's'} first, over different scenes, for {refCost} units. You see them before
            anything else is spent. Making the style from them then costs {make.createUnits} more, which includes
            its sample drawing.
          </p>

          <div className="create-actions">
            <button onClick={drawReferences} disabled={!ready || Boolean(busy)}>
              {busy === 'drawing'
                ? `Drawing ${count} reference${count === 1 ? '' : 's'}… about ${count * 20} seconds`
                : `Draw references · ${refCost} units`}
            </button>
            <button className="ghost" onClick={onCancel} disabled={Boolean(busy)}>
              Back to styles
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint create-cost">
            Drew {drawn.length} of {draft.references.length} for {draft.spent} units. Untick any that miss the look —
            the style will not learn from them, but they stay on disk.
          </p>

          <div className="picker-grid">
            {draft.references.map((r, i) =>
              'file' in r ? (
                <label key={r.file} className={`style-card ref${kept.includes(r.file) ? ' selected' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local file just drawn */}
                  <img src={r.url} alt={`Reference ${i + 1}`} />
                  <span className="style-meta">
                    <span>
                      <input
                        type="checkbox"
                        checked={kept.includes(r.file)}
                        onChange={(e) =>
                          setKept((k) => (e.target.checked ? [...k, r.file] : k.filter((f) => f !== r.file)))
                        }
                      />{' '}
                      Keep
                    </span>
                  </span>
                </label>
              ) : (
                <div key={i} className="style-card ref">
                  <span className="no-sample">Not drawn</span>
                  <span className="style-meta">
                    <span className="hint error">{r.error}</span>
                  </span>
                </div>
              ),
            )}
          </div>

          <div className="create-actions">
            <button onClick={makeStyle} disabled={!kept.length || !name.trim() || Boolean(busy)}>
              {busy === 'making'
                ? 'Making the style and drawing its sample…'
                : `Make the style from ${kept.length} · ${make.createUnits} units`}
            </button>
            <button
              className="ghost"
              disabled={Boolean(busy)}
              onClick={() => {
                // The drawn references stay on disk; editing starts a new draft.
                setDraft(null)
                setKept([])
              }}
            >
              Edit the description
            </button>
          </div>
        </>
      )}

      {error ? <p className="error hint">{error}</p> : null}
    </div>
  )
}
