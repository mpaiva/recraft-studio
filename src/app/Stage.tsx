'use client'

import type { Item } from './api/generate/route'

type Style = { key: string; name: string; size: string; units: number }
type Palette = { hex: string[]; scheme: { name: string; reason: string }; base: number }
type Drawn = Extract<Item, { ok: true }>

/** One press of Draw, as it arrives. `items[i]` is undefined until drawing i is back. */
export type SetRun = {
  id: number
  number: number
  subjects: string[]
  style: Style | null
  palette: Palette | null
  items: (Item | undefined)[]
  status: 'drawing' | 'done' | 'failed'
  error?: string
  spent?: { images: number; units: number }
  expanded: boolean
}

export function download(name: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** A filename from the subject, so a downloaded set is readable in a folder. */
function slug(subject: string, index: number) {
  const base = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${String(index + 1).padStart(2, '0')}-${base || 'illustration'}.svg`
}

/** `1536x1024` → `1536 / 1024`, so a placeholder is the shape of the drawing it waits for. */
const ratio = (size?: string) => (size ? size.replace('x', ' / ') : '3 / 2')

/**
 * Where drawings land.
 *
 * Newest set on top. Earlier sets stay, collapsed, rather than being replaced:
 * each one was paid for, and pressing Draw again should not quietly throw the
 * last one away. They last as long as the page does — nothing here is saved.
 */
export function Stage({
  sets,
  onToggle,
  preview,
}: {
  sets: SetRun[]
  onToggle: (id: number) => void
  preview: { styleName?: string; sample?: string; hex?: string[]; scheme?: string }
}) {
  if (!sets.length) {
    return (
      <div className="stage-empty">
        {preview.sample ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local SVG; next/image adds nothing here
          <img src={preview.sample} alt={`A sample in ${preview.styleName}`} />
        ) : (
          <div className="no-sample" />
        )}
        <h2>Your set will appear here</h2>
        <p className="hint">
          One drawing at a time, as each is finished
          {preview.styleName ? (
            <>
              {' '}
              — in <strong>{preview.styleName}</strong>
            </>
          ) : null}
          {preview.hex ? ', with these colors' : ''}.
        </p>
        {preview.hex ? (
          <span className="swatches">
            {preview.hex.map((c, i) => (
              <span key={i} className="swatch" style={{ background: c }} title={c} />
            ))}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="sets">
      {sets.map((set) => (
        <SetBlock key={set.id} set={set} onToggle={() => onToggle(set.id)} />
      ))}
    </div>
  )
}

function SetBlock({ set, onToggle }: { set: SetRun; onToggle: () => void }) {
  const good = set.items.filter((i): i is Drawn => Boolean(i?.ok))
  const finished = set.items.filter(Boolean).length
  const total = set.subjects.length
  const drawingAt = set.status === 'drawing' ? set.items.findIndex((i) => !i) : -1

  const status =
    set.status === 'drawing'
      ? total
        ? `drawing ${Math.min(finished + 1, total)} of ${total}`
        : 'starting'
      : set.status === 'failed'
        ? `stopped after ${finished} of ${total}`
        : `${good.length} drawn · ${set.spent?.units ?? 0} units`

  return (
    <section className={`set${set.expanded ? '' : ' collapsed'}`} aria-label={`Set ${set.number}`}>
      <header className="set-head">
        <button className="set-toggle" onClick={onToggle} aria-expanded={set.expanded}>
          <strong>Set {set.number}</strong>
        </button>
        {set.palette ? (
          <span className="swatches small">
            {set.palette.hex.map((c, i) => (
              <span key={i} className="swatch" style={{ background: c }} title={c} />
            ))}
          </span>
        ) : null}
        <span className="hint">
          {[set.style?.name, set.palette?.scheme.name, status].filter(Boolean).join(' · ')}
        </span>
        {!set.expanded && good.length ? (
          <span className="thumbs" aria-hidden="true">
            {good.slice(0, 6).map((item, i) => (
              <span key={i} className="thumb" dangerouslySetInnerHTML={{ __html: item.svg }} />
            ))}
          </span>
        ) : null}
        {good.length > 1 && set.expanded ? (
          <button
            className="ghost"
            onClick={() => set.items.forEach((i, n) => i?.ok && download(slug(i.subject, n), i.svg))}
          >
            Download all
          </button>
        ) : null}
      </header>

      {set.error ? <p className="error hint set-error">{set.error}</p> : null}

      {set.expanded ? (
        <div className="grid">
          {set.subjects.map((subject, n) => {
            const item = set.items[n]
            if (item?.ok) {
              return (
                <div className="card" key={n}>
                  {/*
                    The markup comes from Recraft, through normalize(), which
                    strips it to a viewBox and shapes. It is inlined so it
                    scales with the page rather than sitting in an <img> at a
                    fixed size.
                  */}
                  <figure dangerouslySetInnerHTML={{ __html: item.svg }} />
                  <div className="foot">
                    <span className="subject">
                      {item.subject} <span className="hint">· {item.shapes} shapes</span>
                    </span>
                    <button className="ghost" onClick={() => download(slug(item.subject, n), item.svg)}>
                      SVG
                    </button>
                  </div>
                </div>
              )
            }
            const state = item ? 'failed' : n === drawingAt ? 'drawing' : set.status === 'drawing' ? 'queued' : 'missing'
            return (
              <div className={`card pending ${state}`} key={n}>
                <div className="placeholder" style={{ aspectRatio: ratio(set.style?.size) }}>
                  {state === 'drawing' ? 'Drawing…' : state === 'queued' ? 'Queued' : 'Not drawn'}
                </div>
                <div className="foot">
                  <span className={`subject${item ? ' error' : ''}`}>
                    {subject}
                    {item && !item.ok ? (
                      <>
                        <br />
                        {item.error}
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
