'use client'

import { useEffect, useRef, useState } from 'react'
import type { StyleOption } from '@/lib/recraft/styles'

/** What the form knows about a style — the wire parameters stay on the server. */
export type StyleInfo = Omit<StyleOption, 'params'>

/**
 * Browse every style and pick one.
 *
 * A native <dialog>, so Escape, focus trapping and the backdrop come from the
 * browser. The samples all share one subject and one palette, so the only
 * thing that differs between two cards is the style — which is the only thing
 * being chosen here.
 */
export function StylePicker({
  open,
  styles,
  selected,
  onPick,
  onClose,
}: {
  open: boolean
  styles: StyleInfo[]
  selected: string
  onPick: (key: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const match = (s: StyleInfo) => s.name.toLowerCase().includes(query.trim().toLowerCase())
  const groups: { title: string; hint: string; items: StyleInfo[] }[] = [
    { title: 'Curated', hint: 'Recraft’s vector library', items: styles.filter((s) => s.kind === 'curated' && match(s)) },
    { title: 'Yours', hint: 'styles on this Recraft account', items: styles.filter((s) => s.kind === 'custom' && match(s)) },
  ]

  return (
    <dialog
      ref={ref}
      className="picker"
      aria-labelledby="picker-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself, not its contents.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="picker-head">
        <div>
          <h2 id="picker-title">Choose a style</h2>
          <p className="hint">Every sample is the same subject in the same three colors, so only the style differs.</p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      <input
        type="text"
        className="picker-search"
        placeholder="Filter styles"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter styles"
      />

      <div className="picker-body">
        {groups.map((group) =>
          group.items.length ? (
            <section key={group.title}>
              <h3>
                {group.title} <span className="hint">— {group.hint}</span>
              </h3>
              <div className="picker-grid">
                {group.items.map((s) => (
                  <button
                    key={s.key}
                    className={`style-card${s.key === selected ? ' selected' : ''}`}
                    disabled={Boolean(s.disabled)}
                    aria-pressed={s.key === selected}
                    title={s.disabled}
                    onClick={() => {
                      onPick(s.key)
                      onClose()
                    }}
                  >
                    {s.sample ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local SVG; next/image adds nothing here
                      <img src={s.sample} alt={`Sample in ${s.name}`} loading="lazy" />
                    ) : (
                      <span className="no-sample">{s.disabled ? 'Raster only' : 'No sample yet'}</span>
                    )}
                    <span className="style-meta">
                      <strong>{s.name}</strong>
                      <span className="hint">
                        {s.disabled
                          ? s.disabled
                          : `${s.units} units per image${s.created ? ` · made ${s.created.slice(0, 10)}` : ''}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null,
        )}
        {groups.every((g) => !g.items.length) ? <p className="hint">No style matches “{query}”.</p> : null}
      </div>
    </dialog>
  )
}
