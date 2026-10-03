import { useMemo, useState } from 'react'
import type { HandoverLineResult, Specimen } from '@/types'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { accessionStore } from '@/stores/accessionStore'
import { handoverStore } from '@/stores/handoverStore'
import { siteStore } from '@/stores/siteStore'
import { processHandover } from '@/services/handoverService'
import type { HandoverSummary } from '@/services/handoverService'

const todayCompact = (): string => new Date().toISOString().slice(0, 10).replace(/-/g, '')

/**
 * 馆队交接：采集队交一张单（每行现场编号，或 现场编号,馆藏号），
 * 馆里按「队名 + 现场编号」逐行配对配号。
 * - 写错号 / 指定馆藏号已被占用：只退回这一行并说明，其他行照旧配好；
 * - 同一张单（单号不变）失败后按双方进度重送：已配对行回放原号，不会多配号。
 */
export default function HandoverPage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const accessions = usePersistentStore(accessionStore, (state) => state.rows)
  const batches = usePersistentStore(handoverStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)

  const [team, setTeam] = useState('')
  const [sheetId, setSheetId] = useState(`HD-${todayCompact()}-01`)
  const [text, setText] = useState('')
  const [summary, setSummary] = useState<HandoverSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const siteNameOf = (siteId: string): string => sites.find((site) => site.id === siteId)?.name ?? '未关联采集地'

  /** 尚未配对馆藏号的现场标本，按队分组 */
  const pendingByTeam = useMemo(() => {
    const pairedIds = new Set(accessions.map((acc) => acc.specimenId))
    const pending = specimens.filter((sp) => !pairedIds.has(sp.id))
    const map = new Map<string, Specimen[]>()
    pending.forEach((sp) => {
      const list = map.get(sp.team) ?? []
      list.push(sp)
      map.set(sp.team, list)
    })
    return map
  }, [specimens, accessions])

  const pendingOfTeam = pendingByTeam.get(team.trim()) ?? []

  const fillFromPending = (): void => {
    if (!team.trim()) {
      setError('请先填写采集队名')
      return
    }
    setText((prev) => {
      const existing = new Set(
        prev
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
      const additions = pendingOfTeam.map((sp) => sp.fieldNo).filter((no) => !existing.has(no))
      return [...prev.split(/\r?\n/).filter((line) => line.trim()), ...additions].join('\n')
    })
    setError('')
  }

  const submit = async (): Promise<void> => {
    if (!team.trim()) {
      setError('请填写交接的采集队名（一张单只对一个队）')
      return
    }
    if (!sheetId.trim()) {
      setError('请填写交接单号：同一张单重送务必保持单号一致，已配好的号才会原样回放')
      return
    }
    if (!text.trim()) {
      setError('交接单内容为空：每行一条「现场编号」或「现场编号,馆藏号」')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await processHandover(sheetId.trim(), team.trim(), text)
      setSummary(result)
      await Promise.all([
        specimenStore.getState().hydrate(),
        accessionStore.getState().hydrate(),
        handoverStore.getState().hydrate()
      ])
    } catch (e) {
      setError(`交接未能完成：${(e as Error).message}。已配对的行不受影响，可按原单号重送。`)
    } finally {
      setBusy(false)
    }
  }

  const loadBatch = (id: string): void => {
    const batch = batches.find((item) => item.id === id)
    if (!batch) return
    setTeam(batch.team)
    setSheetId(batch.sheetId)
    setText(batch.rawText)
    setSummary({
      paired: batch.results.filter((r) => r.status === 'paired').length,
      replayed: batch.results.filter((r) => r.status === 'replayed').length,
      rejected: batch.results.filter((r) => r.status === 'rejected').length,
      results: batch.results
    })
    setError('')
  }

  const resultTone = (row: HandoverLineResult): string => {
    if (row.status === 'paired') return 'border-field-200 bg-field-50 text-field-800'
    if (row.status === 'replayed') return 'border-slate-200 bg-slate-50 text-slate-600'
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }
  const resultLabel = (row: HandoverLineResult): string =>
    row.status === 'paired' ? '新配号' : row.status === 'replayed' ? '已配对·回放' : '退回'

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">馆队交接</h1>
        <p className="page-sub">
          按「采集队名 + 现场编号」配对，馆方配发馆藏号（柜位、鉴定、导出都认馆藏号）。
          每行写「现场编号」由馆方自动配号，或写「现场编号,馆藏号」指定号码；单内出错只退该行，原单重送不重复配号。
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="panel flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <span className="field-label">采集队名</span>
              <input className="field-input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="如 黔南一队" list="team-list" />
              <datalist id="team-list">
                {Array.from(pendingByTeam.keys()).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <span className="field-label">交接单号（同一张单重送保持不变）</span>
              <input className="field-input font-mono text-xs" value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="field-label">交接单内容（每行：现场编号 或 现场编号,馆藏号）</span>
              <button className="btn-ghost text-xs" type="button" onClick={fillFromPending}>
                填入该队待交接现场号（{pendingOfTeam.length}）
              </button>
            </div>
            <textarea
              className="field-input h-56 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'001\n002\n003,QLB-2026-0099\n# # 开头是注释，空行跳过'}
              data-testid="handover-text"
            />
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex items-center gap-2">
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? '交接处理中…' : '提交交接单'}
            </button>
            {summary ? (
              <span className="text-xs text-slate-600" data-testid="handover-summary">
                新配号 <b className="text-field-700">{summary.paired}</b> · 已配对回放{' '}
                <b>{summary.replayed}</b> · 退回 <b className="text-rose-600">{summary.rejected}</b>
              </span>
            ) : null}
          </div>

          {summary ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-sm font-semibold text-slate-700">逐行结果</h2>
              {summary.results.map((row) => (
                <div key={row.line} className={`rounded-lg border px-3 py-2 text-xs ${resultTone(row)}`} data-testid="handover-line">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono">第 {row.line} 行</span>
                    <span className="font-mono">{row.raw}</span>
                    <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5">{resultLabel(row)}</span>
                  </div>
                  {row.status === 'rejected' ? (
                    <p className="mt-1">退回原因：{row.reason}</p>
                  ) : (
                    <p className="mt-1">
                      {row.team} · 现场编号 {row.fieldNo} → 馆藏号{' '}
                      <span className="font-mono font-semibold">{row.accessionNo}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">待交接标本（按队）</h2>
            <div className="mt-2 max-h-64 space-y-3 overflow-auto text-xs">
              {pendingByTeam.size === 0 ? <p className="text-slate-400">全部现场标本都已配上馆藏号</p> : null}
              {Array.from(pendingByTeam.entries()).map(([name, rows]) => (
                <div key={name}>
                  <p className="font-medium text-slate-700">
                    {name} <span className="text-slate-400">（{rows.length} 份未交接）</span>
                  </p>
                  <ul className="mt-1 space-y-1">
                    {rows.map((sp) => (
                      <li key={sp.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1">
                        <span>
                          <span className="font-mono text-field-700">{sp.fieldNo}</span>
                          <span className="ml-1 text-slate-500">{sp.tempName || sp.order}</span>
                        </span>
                        <span className="text-slate-400">{siteNameOf(sp.siteId)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">历史交接单（点击调阅/按原单重送）</h2>
            <ul className="mt-2 max-h-72 space-y-1.5 overflow-auto text-xs">
              {batches.map((batch) => {
                const rejected = batch.results.filter((r) => r.status === 'rejected').length
                return (
                  <li key={batch.id}>
                    <button
                      type="button"
                      onClick={() => loadBatch(batch.id)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-field-700">{batch.sheetId}</span>
                        <span className="text-slate-400">{batch.submittedAt}</span>
                      </span>
                      <span className="mt-0.5 block text-slate-600">
                        {batch.team} · 共 {batch.results.length} 行
                        {rejected > 0 ? <span className="text-rose-600"> · {rejected} 行退回</span> : ' · 全部配对'}
                      </span>
                    </button>
                  </li>
                )
              })}
              {batches.length === 0 ? <li className="text-slate-400">暂无交接单</li> : null}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
