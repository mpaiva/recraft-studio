'use client'

import { useEffect, useState } from 'react'
import type { Item } from './api/generate/route'

type Account = { credits: number; unitsPerImage: number; style: { trained: boolean; key: string } }
type Result = {
  items: Item[]
  palette: { hex: string[]; scheme: { name: string; reason: string }; base: number }
  style: { trained: boolean; key: string }
  spent: { images: number; units: number }
}

function download(name: string, svg: string) {
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

export function Studio() {
  const [brief, setBrief] = useState('')
  const [industry, setIndustry] = useState('')
  const [lines, setLines] = useState('')
  const [count, setCount] = useState(3)
  const [salt, setSalt] = useState('')

  const [account, setAccount] = useState<Account | null>(null)
  const [accountError, setAccountError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState('')

  // Ask what the account can spend before anything is committed to. Free, and
  // the alternative is finding out from a 400 partway through a batch.
  useEffect(() => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => (d.error ? setAccountError(d.error) : setAccount(d)))
      .catch((e) => setAccountError(String(e)))
  }, [])

  const subjects = lines.split('\n').map((s) => s.trim()).filter(Boolean)
  const images = Math.min(subjects.length || count, 6)
  const needed = images * (account?.unitsPerImage ?? 80)
  const affordable = account ? account.credits >= needed : true

  async function run() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, industry, subjects, count, salt }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? `Request failed: ${res.status}`)
      else {
        setResult(data)
        // The balance moved; reflect it rather than showing a stale number.
        setAccount((a) => (a ? { ...a, credits: a.credits - data.spent.units } : a))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
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

  const good = result?.items.filter((i): i is Extract<Item, { ok: true }> => i.ok) ?? []

  return (
    <div className="wrap">
      <h1>Recraft Studio</h1>
      <p className="lede">
        A brief in, a set of SVGs out. One palette is shared across the set so the images
        belong together, and the cost is shown before anything is spent.
      </p>

      <div className="panel">
        {accountError ? (
          <p className="error notice">
            {accountError}
            <br />
            <span className="hint">Copy .env.local.example to .env.local and add your token.</span>
          </p>
        ) : account ? (
          <div className="meta">
            <span>API credit <strong>{account.credits.toLocaleString()}</strong></span>
            <span>Per image <strong>{account.unitsPerImage}</strong></span>
            <span>
              Style{' '}
              <strong>{account.style.trained ? 'trained' : 'fallback (colored_stencil)'}</strong>
            </span>
            <span>This run <strong className={affordable ? '' : 'error'}>{needed}</strong></span>
          </div>
        ) : (
          <p className="hint">Checking the API balance…</p>
        )}
      </div>

      <div className="panel">
        <label htmlFor="brief">
          Brief <span className="hint">— the direction every image in the set shares</span>
        </label>
        <textarea
          id="brief"
          rows={2}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="A series about remote engineering teams"
        />

        <div style={{ height: 14 }} />

        <label htmlFor="industry">
          Industry <span className="hint">— optional context for the setting and props</span>
        </label>
        <input
          id="industry"
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Healthcare, logistics, fintech…"
        />

        <div style={{ height: 14 }} />

        <label htmlFor="lines">
          Subjects <span className="hint">— one per line, or leave empty for variations on the brief</span>
        </label>
        <textarea
          id="lines"
          rows={5}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          placeholder={'a stand-up call across four time zones\na pull request waiting overnight\nan onboarding checklist'}
        />

        <div style={{ height: 8 }} />

        <button className="ghost" onClick={improve} disabled={improving || busy || (!industry && !brief)}>
          {improving
            ? 'Improving…'
            : subjects.length
              ? `Improve ${subjects.length === 1 ? 'subject' : 'subjects'} for ${industry || 'the brief'}`
              : `Suggest ${count} subjects for ${industry || 'the brief'}`}
        </button>{' '}
        {improveError ? <span className="error hint">{improveError}</span> : null}

        <div style={{ height: 14 }} />

        <div className="row">
          <div>
            <label htmlFor="count">
              How many <span className="hint">— used only when no subjects are listed</span>
            </label>
            <input
              id="count"
              type="number"
              min={1}
              max={6}
              value={count}
              disabled={subjects.length > 0}
              onChange={(e) => setCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            />
          </div>
          <div>
            <label htmlFor="salt">
              Palette salt <span className="hint">— change it to reroll the colours</span>
            </label>
            <input id="salt" type="text" value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div style={{ height: 18 }} />

        <button onClick={run} disabled={busy || (!brief && !subjects.length) || !affordable}>
          {busy
            ? `Drawing ${images}…`
            : `Draw ${images} illustration${images === 1 ? '' : 's'} · ${needed} units`}
        </button>{' '}
        {!affordable && account ? (
          <span className="error hint">
            Balance is {account.credits}; this needs {needed}.
          </span>
        ) : null}
      </div>

      {error ? <p className="panel error notice">{error}</p> : null}

      {result ? (
        <>
          <div className="panel">
            <div className="meta" style={{ alignItems: 'center' }}>
              <span className="swatches">
                {result.palette.hex.map((c) => (
                  <span key={c} className="swatch" style={{ background: c }} title={c} />
                ))}
              </span>
              <span>
                Scheme <strong>{result.palette.scheme.name}</strong>
              </span>
              <span>
                Drew <strong>{result.spent.images}</strong> for <strong>{result.spent.units}</strong> units
              </span>
              {good.length > 1 ? (
                <button
                  className="ghost"
                  onClick={() => good.forEach((i, n) => download(slug(i.subject, n), i.svg))}
                >
                  Download all
                </button>
              ) : null}
            </div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              {result.palette.scheme.reason}
            </p>
          </div>

          <div className="grid">
            {result.items.map((item, n) => (
              <div className="card" key={n}>
                {item.ok ? (
                  <>
                    {/*
                      The markup comes from Recraft, through normalise(), which
                      strips it to a viewBox and shapes. It is inlined so it
                      scales and themes with the page rather than sitting in an
                      <img> at a fixed size.
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
                  </>
                ) : (
                  <div className="foot">
                    <span className="subject error">
                      {item.subject}
                      <br />
                      {item.error}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
