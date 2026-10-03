import { useMemo, useState } from 'react'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { previewHandover, resolveAutoPrefix } from '@/utils/handover'
import type { HandoverMatched, HandoverRejected } from '@/utils/handover'
import { accessionLabel } from '@/utils/codec'

/**
 * 交接台：馆方把采集队送来的交接单（每行「现场编号」或「现场编号 馆藏号」）
 * 按「队名 + 现场编号」配对。坏号 / 找不到 / 馆号被占用只退回该行并说明，
 * 其他行照常配对；已配对行与同一张单重送都不会重复配号，失败行改好后可直接重送续跑。
 */
export default function HandoverPage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)

  const [team, setTeam] = useState('')
  const [prefix, setPrefix] = useState('GB')
  const [year, setYear] = useState(new Date().toISOString().slice(0, 4))
  const [sheet, setSheet] = useState('')
  const [matched, setMatched] = useState<HandoverMatched[]>([])
  const [rejected, setRejected] = useState<HandoverRejected[]>([])
  const [notice, setNotice] = useState('')

  const knownTeams = useMemo(() => Array.from(new Set(specimens.map((item) => item.team).filter(Boolean))).sort(), [specimens])

  const autoPrefix = resolveAutoPrefix(
    prefix,
    specimens.map((item) => item.accessionNo).filter(Boolean)
  )

  // 实时预检：展示每行将如何处理，不落库
  const preview = useMemo(() => {
    if (!sheet.trim() || !team.trim()) return null
    return previewHandover(team, sheet, specimens, autoPrefix, year).result
  }, [sheet, team, specimens, autoPrefix, year])

  const pendingOfTeam = useMemo(
    () => specimens.filter((item) => item.team.trim() === team.trim() && !item.accessionNo),
    [specimens, team]
  )

  const fillPending = (): void => {
    const text = pendingOfTeam.map((item) => item.fieldNo).join('\n')
    setSheet(text)
    setNotice(`已载入该队 ${pendingOfTeam.length} 份未交接标本的现场编号，馆号将自动分配`)
  }

  const submit = async (): Promise<void> => {
    if (!team.trim()) {
      setNotice('请先填写或选择采集队名')
      return
    }
    if (!sheet.trim()) {
      setNotice('请粘贴交接单内容')
      return
    }
    const outcome = await specimenStore.getState().handover(team, sheet, autoPrefix, year)
    setMatched(outcome.matched)
    setRejected(outcome.rejected)
    const fresh = outcome.matched.filter((item) => !item.alreadyPaired).length
    const skipped = outcome.matched.length - fresh
    setNotice(
      `交接完成：新配对 ${fresh} 份${skipped ? `，已配对幂等跳过 ${skipped} 份` : ''}，退回 ${outcome.rejected.length} 行${
        outcome.rejected.length ? '（仅这些行未处理，改好后直接重送即可续跑）' : ''
      }`
    )
  }

  const newCount = preview?.matched.filter((item) => !item.alreadyPaired).length ?? 0
  const skipCount = preview?.matched.length ? preview.matched.length - newCount : 0

  // 未提交过展示预检；执行过交接后展示真实落库结果
  const submitted = matched.length > 0 || rejected.length > 0
  const shownMatched = submitted ? matched : preview?.matched ?? []
  const shownRejected = submitted ? rejected : preview?.rejected ?? []

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">标本交接台</h1>
        <p className="page-sub">
          按「队名 + 现场编号」把采集队的现场记录与馆方馆藏号配对：每行写「现场编号」可自动配号，或写「现场编号 馆藏号」直接登记。写错的号、对不上的队或已被占用的馆号只退回该行，其余配对照常保留；同一张单重送不会多配号，失败行改好重送即续跑。
        </p>
      </header>

      <section className="panel grid gap-3 md:grid-cols-[260px_140px_120px_1fr]">
        <div>
          <span className="field-label">采集队</span>
          <input className="field-input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="如 黔南二队" list="handover-teams" />
          <datalist id="handover-teams">
            {knownTeams.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <span className="field-label">自动配号前缀</span>
          <input className="field-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="GB" />
        </div>
        <div>
          <span className="field-label">自动配号年份</span>
          <input className="field-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
        </div>
        <div className="self-end text-xs text-slate-500">
          {team.trim() ? (
            <>
              该队未交接 <b className="text-field-700">{pendingOfTeam.length}</b> 份；馆号实际前缀 <b>{autoPrefix}</b>
              <button className="btn-ghost ml-2 px-2 py-1" type="button" onClick={fillPending} disabled={pendingOfTeam.length === 0}>
                载入待交接现场号
              </button>
            </>
          ) : (
            '选择或填写队名后可载入该队待交接清单'
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">交接单（每行一条）</h2>
          <textarea
            className="field-input h-72 font-mono text-xs"
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
            placeholder={'黔南-2026-0007\n黔南-2026-0008 GB-2026-0010\n黔南-2026-0009'}
            data-testid="handover-sheet"
          />
          <p className="text-[11px] text-slate-400">
            一行一列＝现场编号（馆号自动分配）；一行两列＝现场编号 + 指定馆藏号；支持空格/逗号/制表符分隔。
          </p>
          {preview ? (
            <p className="text-xs text-slate-600">
              预检：将新配对 <b className="text-field-700">{newCount}</b> 份
              {skipCount > 0 ? <>，已配对跳过 {skipCount} 份</> : null}
              {preview.rejected.length > 0 ? <>，<b className="text-rose-600">退回 {preview.rejected.length} 行</b></> : null}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button className="btn-primary" type="button" onClick={() => void submit()}>
              执行交接配对
            </button>
            <button className="btn-ghost" type="button" onClick={() => { setSheet(''); setMatched([]); setRejected([]); setNotice('') }}>
              清空
            </button>
          </div>
          {notice ? <p className="text-sm text-field-700">{notice}</p> : null}
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">
              配对结果{shownMatched.length > 0 ? `（${shownMatched.length}）` : ''}
            </h2>
            <div className="mt-2 max-h-64 space-y-1 overflow-auto">
              {shownMatched.map((item, index) => (
                <div key={`${item.lineNo}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-field-100 bg-field-50 px-2 py-1 text-xs">
                  <span className="text-slate-500">第 {item.lineNo} 行</span>
                  <span className="font-mono text-slate-700">{item.fieldNo}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono font-semibold text-field-700">{item.accessionNo}</span>
                  {item.alreadyPaired ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">已配对·跳过</span>
                  ) : item.allocated ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-field-700">自动分配</span>
                  ) : (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-field-700">单上登记</span>
                  )}
                </div>
              ))}
              {shownMatched.length === 0 ? <p className="text-xs text-slate-400">尚无成功配对的行</p> : null}
            </div>
          </div>

          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">退回行{shownRejected.length > 0 ? `（${shownRejected.length}）` : ''}</h2>
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-auto">
              {shownRejected.map((item: HandoverRejected, index) => (
                <li key={`${item.lineNo}-${index}`} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
                  <p>
                    <b>第 {item.lineNo} 行</b>
                    {item.fieldNo ? <> · 现场编号 <span className="font-mono">{item.fieldNo}</span></> : null}
                    {item.accessionNo ? <> · 馆藏号 <span className="font-mono">{item.accessionNo}</span></> : null}
                  </p>
                  <p className="mt-0.5">{item.reason}</p>
                  <p className="mt-0.5 text-[11px] text-rose-500">仅本行退回，其他行配对不受影响；改好后整单重送即可</p>
                </li>
              ))}
              {shownRejected.length === 0 ? <li className="text-xs text-slate-400">没有退回行</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-sm font-semibold text-slate-700">该队标本进度（左现场号 / 右馆藏号）</h2>
        {team.trim() ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="border border-slate-200 px-2 py-1">现场编号</th>
                  <th className="border border-slate-200 px-2 py-1">馆藏号</th>
                  <th className="border border-slate-200 px-2 py-1">改号留痕</th>
                </tr>
              </thead>
              <tbody>
                {specimens
                  .filter((item) => item.team.trim() === team.trim())
                  .map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-2 py-1 font-mono">{item.fieldNo}</td>
                      <td className="border border-slate-200 px-2 py-1 font-mono text-field-700">{accessionLabel(item)}</td>
                      <td className="border border-slate-200 px-2 py-1 text-slate-500">
                        {item.fieldNoHistory.length > 0
                          ? item.fieldNoHistory.map((change) => `${change.from} → ${change.to}`).join('；')
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">填写队名后显示该队全部标本的两侧进度</p>
        )}
      </section>
    </div>
  )
}
