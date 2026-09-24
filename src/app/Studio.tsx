'use client'

import { useEffect, useState } from 'react'
import type { SetEvent } from './api/generate/route'
import { paletteFor, parseHex, SCHEMES, toHex } from '@/lib/palette'
import { StylePicker, type StyleInfo } from './StylePicker'
import type { MakeInfo } from './CreateStyle'
import { Stage, type SetRun } from './Stage'

type Account = { credits: number }

/**
 * The app: a narrow column of decisions on the left, and a stage for what
 * they produce on the right.
 *
 * The column runs in the order the decisions are made — what to draw, how to
 * draw it, in which colors — and ends in the price and the Draw button, pinned
 * so they are always in reach however long the column gets.
 */
export function Studio() {
  const [brief, setBrief] = useState('')
  const [industry, setIndustry] = useState('')
  const [lines, setLines] = useState('')
  const [count, setCount] = useState(3)
  const [salt, setSalt] = useState('')
  const [brand, setBrand] = useState('')
  const [scheme, setScheme] = useState('')

  const [account, setAccount] = useState<Account | null>(null)
  const [accountError, setAccountError] = useState('')
  const [busy, setBusy] = useState(false)
  const [styles, setStyles] = useState<StyleInfo[]>([])
  const [styleKey, setStyleKey] = useState('')
  const [picking, setPicking] = useState(false)
  const [make, setMake] = useState<MakeInfo | null>(null)
  const [styleNote, setStyleNote] = useState('')
  const [error, setError] = useState('')
  const [sets, setSets] = useState<SetRun[]>([])
  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState('')

  // Ask what the account can spend before anything is committed to. Free, and
  // the alternative is finding out from a 400 partway through a batch.
  function loadBalance() {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => (d.error ? setAccountError(d.error) : setAccount(d)))
      .catch((e) => setAccountError(String(e)))
  }

  function loadStyles(select?: string) {
    fetch('/api/styles')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return
        setStyles(d.styles)
        setMake(d.make)
        setStyleKey((k) => select || k || d.defaultKey)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadBalance()
    loadStyles()
  }, [])

  const subjects = lines.split('\n').map((s) => s.trim()).filter(Boolean)
  const images = Math.min(subjects.length || count, 6)
  // The price is per style — curated and account styles use different models.
  const style = styles.find((s) => s.key === styleKey)
  const needed = images * (style?.units ?? 80)
  const affordable = account ? account.credits >= needed : true

  // The same call the server makes, with the same inputs trimmed the same way,
  // so the swatches here are the colors that will be drawn — seen before
  // anything is spent rather than after.
  const brandRgb = parseHex(brand)
  const brandInvalid = Boolean(brand.trim()) && !brandRgb
  const seedText = brief.trim() || subjects[0]
  const preview = seedText ? paletteFor(seedText, salt.trim(), brandRgb ? brand.trim() : '', scheme) : null

  const update = (id: number, change: (set: SetRun) => SetRun) =>
    setSets((all) => all.map((s) => (s.id === id ? change(s) : s)))

  async function run() {
    setBusy(true)
    setError('')
    const id = Date.now()
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, industry, subjects, count, salt, brand: brand.trim(), scheme, style: styleKey }),
      })
      // Anything refused before spending — bad input, not enough credit — is
      // plain JSON with a status, and never becomes a set.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Request failed: ${res.status}`)
        return
      }

      // The new set goes on top, open; the earlier ones fold away but stay.
      setSets((all) => [
        {
          id,
          number: all.length + 1,
          subjects: [],
          style: null,
          palette: null,
          items: [],
          status: 'drawing',
          expanded: true,
        },
        ...all.map((s) => ({ ...s, expanded: false })),
      ])

      // One JSON object per line, as each drawing is finished.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let finished = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as SetEvent
          if (event.type === 'start') {
            update(id, (s) => ({
              ...s,
              subjects: event.subjects,
              style: event.style,
              palette: event.palette,
              items: new Array(event.subjects.length).fill(undefined),
            }))
          } else if (event.type === 'item') {
            update(id, (s) => ({ ...s, items: s.items.map((it, i) => (i === event.index ? event.item : it)) }))
          } else if (event.type === 'done') {
            finished = true
            update(id, (s) => ({ ...s, status: 'done', spent: event.spent }))
          }
        }
      }
      if (!finished) {
        update(id, (s) => ({ ...s, status: 'failed', error: 'The connection closed before the set was finished.' }))
      }
    } catch (e) {
      update(id, (s) => ({ ...s, status: 'failed', error: String(e) }))
      setError(String(e))
    } finally {
      setBusy(false)
      // Read the real balance rather than subtracting an estimate.
      loadBalance()
    }
  }

  // Rewrites the subjects in place rather than drawing them, so the result is
  // read and edited before any Recraft units are spent on it.
  async function improve() {
    setImproving(true)
    setImproveError('')
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, industry, subjects, count }),
      })
      const data = await res.json()
      if (!res.ok) setImproveError(data.error ?? `Request failed: ${res.status}`)
      else setLines(data.subjects.join('\n'))
    } catch (e) {
      setImproveError(String(e))
    } finally {
      setImproving(false)
    }
  }

  const schemeName = SCHEMES.find((s) => s.id === scheme)?.name

  return (
    <div className="app">
      <aside className="sidebar" aria-label="What to draw">
        <header className="sidebar-head">
          <h1>Recraft Studio</h1>
          {account ? (
            <span className="hint" title="Prepaid API credit — separate from Recraft subscription credits">
              {account.credits.toLocaleString()} credit
            </span>
          ) : null}
        </header>

        <div className="sidebar-scroll">
          {accountError ? (
            <p className="error notice">
              {accountError}
              <br />
              <span className="hint">Copy .env.local.example to .env.local and add your token.</span>
            </p>
          ) : null}

          <div className="field">
            <label htmlFor="brief">
              Brief <span className="hint">— what the set shares</span>
            </label>
            <textarea
              id="brief"
              rows={2}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="A series about remote engineering teams"
            />
          </div>

          <div className="field">
            <label htmlFor="industry">
              Industry <span className="hint">— optional context</span>
            </label>
            <input
              id="industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Healthcare, logistics, fintech…"
            />
          </div>

          <div className="field">
            <label htmlFor="lines">
              Subjects <span className="hint">— one per line, or none for variations</span>
            </label>
            <textarea
              id="lines"
              rows={5}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              placeholder={'a stand-up call across four time zones\na pull request waiting overnight\nan onboarding checklist'}
            />
            <div className="field-row">
              <button className="ghost small" onClick={improve} disabled={improving || busy || (!industry && !brief)}>
                {improving
                  ? 'Improving…'
                  : subjects.length
                    ? `Improve for ${industry || 'the brief'}`
                    : `Suggest for ${industry || 'the brief'}`}
              </button>
              {subjects.length ? null : (
                <label className="inline">
                  How many
                  <input
                    id="count"
                    type="number"
                    min={1}
                    max={6}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                  />
                </label>
              )}
            </div>
            {improveError ? <p className="error hint small-note">{improveError}</p> : null}
          </div>

          <section className="group" aria-labelledby="style-label">
            <label id="style-label">Style</label>
            <button className="style-current" onClick={() => setPicking(true)} disabled={!styles.length}>
              {style?.sample ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local SVG; next/image adds nothing here
                <img src={style.sample} alt="" />
              ) : (
                <span className="no-sample" />
              )}
              <span className="style-meta">
                <strong>{style?.name ?? 'Loading styles…'}</strong>
                {style ? (
                  <span className="hint">
                    {style.kind === 'curated' ? 'Curated' : 'Yours'} · {style.units} per image
                  </span>
                ) : null}
              </span>
              <span className="hint change" aria-hidden="true">›</span>
            </button>
            {styleNote ? <p className="error hint small-note">{styleNote}</p> : null}
          </section>

          {/*
            Every color decision in one place, in the order they are made: pin it
            to a brand, choose how the hues sit on the wheel, then see the palette
            that comes out and reroll it. The first two fold away, since most sets
            leave them alone; the palette is always in view.
          */}
          <section className="group" aria-label="Color">
            <details className="color-options">
              <summary>
                <span>Color</span>
                <span className="hint">
                  {brandRgb ? toHex([brandRgb])[0] : 'No brand color'} · {schemeName ?? 'Auto scheme'}
                </span>
              </summary>

              <div className="field">
                <label htmlFor="brand">
                  Brand color <span className="hint">— the palette is built around it</span>
                </label>
                <div className="brand">
                  <input
                    type="color"
                    aria-label="Pick a brand color"
                    value={brandRgb ? toHex([brandRgb])[0] : (preview?.hex[0] ?? '#7c3aed')}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                  <input id="brand" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="#0f766e" />
                  {brand ? (
                    <button className="ghost small" onClick={() => setBrand('')}>
                      Clear
                    </button>
                  ) : null}
                </div>
                {brandInvalid ? (
                  <p className="error hint small-note">&ldquo;{brand.trim()}&rdquo; is not a hex color like #0f766e.</p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="scheme">
                  Scheme <span className="hint">— how the hues sit on the wheel</span>
                </label>
                <select id="scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}>
                  <option value="">Auto — picked from the brief</option>
                  <optgroup label="High contrast (Auto chooses from these)">
                    {SCHEMES.filter((s) => s.auto).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Chosen only">
                    {SCHEMES.filter((s) => !s.auto).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </details>

            <label>Palette</label>
            {preview ? (
              <>
                <div className="palette-row">
                  <span className="swatches">
                    {preview.hex.map((c, i) => (
                      <span
                        key={i}
                        className={`swatch${brandRgb && i === 0 ? ' anchored' : ''}`}
                        style={{ background: c }}
                        title={brandRgb && i === 0 ? `${c} (brand)` : c}
                      />
                    ))}
                  </span>
                  <span className="hint">
                    {preview.auto ? 'Auto: ' : ''}
                    {preview.scheme.name}
                  </span>
                  <span className="palette-actions">
                    {salt ? (
                      <button className="ghost small" onClick={() => setSalt('')} title="Back to the first palette">
                        First
                      </button>
                    ) : null}
                    <button className="ghost small" onClick={() => setSalt((s) => String((Number(s) || 0) + 1))}>
                      Reroll
                    </button>
                  </span>
                </div>
                <p className="hint small-note">
                  {preview.scheme.reason}
                  {brandRgb ? ' The brand color is used exactly; the other two are placed around its hue.' : ''}
                </p>
              </>
            ) : (
              <p className="hint small-note">Write a brief or a subject to see the colors.</p>
            )}
          </section>
        </div>

        <footer className="sidebar-foot">
          {error ? <p className="error hint small-note">{error}</p> : null}
          <div className="cost">
            <span className="hint">
              {images} image{images === 1 ? '' : 's'} × {style?.units ?? '…'}
            </span>
            <strong className={affordable ? '' : 'error'}>{needed} units</strong>
          </div>
          {!affordable && account ? (
            <p className="error hint small-note">
              The balance is {account.credits}; this needs {needed}.
            </p>
          ) : null}
          <button
            className="draw"
            onClick={run}
            disabled={busy || (!brief && !subjects.length) || !affordable || brandInvalid || !style}
          >
            {busy ? `Drawing ${images}…` : `Draw ${images} illustration${images === 1 ? '' : 's'}`}
          </button>
        </footer>
      </aside>

      <main className="stage" aria-label="Drawings">
        <Stage
          sets={sets}
          onToggle={(id) => update(id, (s) => ({ ...s, expanded: !s.expanded }))}
          preview={{ styleName: style?.name, sample: style?.sample, hex: preview?.hex, scheme: preview?.scheme.name }}
        />
      </main>

      <StylePicker
        open={picking}
        styles={styles}
        selected={styleKey}
        make={make}
        onPick={setStyleKey}
        onCreated={(key, note) => {
          // A new style has a name and a sample now; fetch the list again and select it.
          loadStyles(key)
          setStyleNote(note ?? '')
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </div>
  )
}
