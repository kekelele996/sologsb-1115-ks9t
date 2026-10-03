import { useMemo, useState } from 'react'
import type { CollectMethod, Sex, Specimen, Stage } from '@/types'
import { COLLECT_METHODS, ORDERS, SEXES, STAGES } from '@/types'
import SpecimenCard from '@/components/common/SpecimenCard'
import SitePicker from '@/components/common/SitePicker'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { isDuplicateFieldNo, suggestFieldNo } from '@/utils/codec'
import { uid } from '@/utils/id'

interface DraftRow {
  id: string
  /** 现场编号：各队按自己的规则编，留空提交时采用建议号 */
  fieldNo: string
  order: string
  family: string
  genus: string
  species: string
  tempName: string
  sex: Sex
  stage: Stage
  bodyLength: string
  method: CollectMethod
  quantity: string
  note: string
}

const newDraft = (fieldNo = ''): DraftRow => ({
  id: uid('draft'),
  fieldNo,
  order: '鞘翅目',
  family: '',
  genus: '',
  species: '',
  tempName: '',
  sex: '未知',
  stage: '成虫',
  bodyLength: '',
  method: '扫网',
  quantity: '1',
  note: ''
})

/** 采集登记：采集队按自己的规则编现场编号；馆藏号在「馆队交接」时才配 */
export default function CollectPage(): JSX.Element {
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)

  const [siteId, setSiteId] = useState('')
  const [collectDate, setCollectDate] = useState(new Date().toISOString().slice(0, 10))
  const [collector, setCollector] = useState('')
  const [team, setTeam] = useState('')
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [justCreated, setJustCreated] = useState<Specimen[]>([])

  const site = sites.find((item) => item.id === siteId)

  /** 每一行最终使用的现场编号：手填优先，空行用队内建议号；同批内自动占位不撞号 */
  const resolvedFieldNos = useMemo(() => {
    const result: Record<string, string> = {}
    const used: string[] = []
    const teamKeys = specimens
      .filter((sp) => sp.team.trim() === team.trim())
      .map((sp) => sp.fieldNo.trim())
    const base = suggestFieldNo(team, specimens)
    drafts.forEach((draft) => {
      const trimmed = draft.fieldNo.trim()
      if (trimmed) {
        result[draft.id] = trimmed
        used.push(trimmed)
        return
      }
      // 空行：从队内现号 + 本批已占用号里递推一个纯数字建议号
      let candidate = base
      const occupied = teamKeys.concat(used)
      while (occupied.indexOf(candidate) !== -1) {
        const nextNum = Number(candidate) + 1
        candidate = String(nextNum).padStart(candidate.length, '0')
      }
      result[draft.id] = candidate
      used.push(candidate)
    })
    return result
  }, [drafts, specimens, team])

  const patchDraft = (id: string, patch: Partial<DraftRow>): void => {
    setDrafts((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const submit = async (): Promise<void> => {
    if (!site) {
      setError('请先选择采集地（馆藏号交接时需要采集地代码作前缀）')
      return
    }
    if (!team.trim()) {
      setError('请填写采集队名（现场编号只在队内查重，不同队可以同号）')
      return
    }
    if (drafts.length === 0) {
      setError('至少登记一条标本')
      return
    }
    const fieldNos = drafts.map((draft) => resolvedFieldNos[draft.id] ?? draft.fieldNo.trim())
    const batchDuplicates = fieldNos.filter((no, index) => fieldNos.indexOf(no) !== index)
    if (batchDuplicates.length > 0) {
      setError(`本批次内现场编号重复：${Array.from(new Set(batchDuplicates)).join('、')}`)
      return
    }
    const clash = fieldNos.find((no) => isDuplicateFieldNo(team, no, specimens))
    if (clash) {
      setError(`采集队「${team.trim()}」的现场编号 ${clash} 已存在（不同队之间允许同号）`)
      return
    }
    if (drafts.some((row) => !row.order.trim())) {
      setError('每行都需要填写目')
      return
    }
    setError('')
    const rows: Specimen[] = drafts.map((draft) => ({
      id: uid('sp'),
      team: team.trim(),
      fieldNo: resolvedFieldNos[draft.id] ?? draft.fieldNo.trim(),
      fieldNoHistory: [],
      accessionNo: '',
      order: draft.order.trim(),
      family: draft.family.trim(),
      genus: draft.genus.trim(),
      species: draft.species.trim(),
      tempName: draft.tempName.trim(),
      collectDate,
      collector: collector.trim(),
      sex: draft.sex,
      stage: draft.stage,
      bodyLength: Number(draft.bodyLength) || 0,
      method: draft.method,
      quantity: Number(draft.quantity) || 1,
      status: '待鉴定',
      determiner: '',
      siteId: site.id,
      note: draft.note.trim()
    }))
    await specimenStore.getState().saveMany(rows)
    setJustCreated(rows)
    setMessage(
      `本批次已登记 ${rows.length} 份标本（${team.trim()}），现场编号：${rows
        .map((row) => row.fieldNo)
        .join('、')}；馆藏号待馆队交接后配发。`
    )
    setDrafts([newDraft()])
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">采集登记</h1>
        <p className="page-sub">
          各采集队按自己的规则编现场编号（仅队内查重，不同队同号互不影响）；选择采集地后自动带出生境信息。
          馆藏号由馆方在「馆队交接」时统一配发。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="panel">
          <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
          {site ? (
            <dl className="mt-3 space-y-1 rounded-lg bg-field-50 p-3 text-xs text-field-700">
              <div>
                <dt className="inline text-field-600">生境类型：</dt>
                <dd className="inline">{site.habitat}</dd>
              </div>
              <div>
                <dt className="inline text-field-600">小生境：</dt>
                <dd className="inline">{site.microHabitat || '—'}</dd>
              </div>
              <div>
                <dt className="inline text-field-600">微气候：</dt>
                <dd className="inline">{site.microClimate || '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-xs text-slate-400">选择采集地后会带出生境与小生境信息</p>
          )}
        </div>

        <div className="panel flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <span className="field-label">采集队名（现场编号的命名空间）</span>
              <input className="field-input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="如 黔南一队" />
            </div>
            <div>
              <span className="field-label">采集日期（决定馆藏号年份）</span>
              <input type="date" className="field-input" value={collectDate} onChange={(e) => setCollectDate(e.target.value)} />
            </div>
            <div>
              <span className="field-label">采集人（本批次统一）</span>
              <input className="field-input" value={collector} onChange={(e) => setCollector(e.target.value)} placeholder="如 陆昀" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" type="button" onClick={() => setDrafts((prev) => [...prev, newDraft()])}>
              + 增加一条标本
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setDrafts((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            >
              - 减少一条
            </button>
            <span className="text-xs text-slate-500">
              本批次 {drafts.length} 条 · 采集队 {team.trim() || '未填'} · 现场编号留空则采用队内建议号
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="border border-slate-200 px-2 py-1">现场编号</th>
                  <th className="border border-slate-200 px-2 py-1">目</th>
                  <th className="border border-slate-200 px-2 py-1">科</th>
                  <th className="border border-slate-200 px-2 py-1">属</th>
                  <th className="border border-slate-200 px-2 py-1">种</th>
                  <th className="border border-slate-200 px-2 py-1">暂定名</th>
                  <th className="border border-slate-200 px-2 py-1">性别</th>
                  <th className="border border-slate-200 px-2 py-1">虫态</th>
                  <th className="border border-slate-200 px-2 py-1">体长mm</th>
                  <th className="border border-slate-200 px-2 py-1">采集方式</th>
                  <th className="border border-slate-200 px-2 py-1">数量</th>
                  <th className="border border-slate-200 px-2 py-1">操作</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td className="border border-slate-200 px-2 py-1">
                      <input
                        className="field-input w-28 font-mono text-xs"
                        value={draft.fieldNo}
                        onChange={(e) => patchDraft(draft.id, { fieldNo: e.target.value })}
                        placeholder={resolvedFieldNos[draft.id]}
                        data-testid="draft-field-no"
                      />
                      {!draft.fieldNo.trim() ? (
                        <span className="mt-0.5 block text-[10px] text-slate-400">建议 {resolvedFieldNos[draft.id]}</span>
                      ) : null}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <select className="field-input" value={draft.order} onChange={(e) => patchDraft(draft.id, { order: e.target.value })}>
                        {ORDERS.map((order) => (
                          <option key={order} value={order}>
                            {order}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input" value={draft.family} onChange={(e) => patchDraft(draft.id, { family: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input" value={draft.genus} onChange={(e) => patchDraft(draft.id, { genus: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input" value={draft.species} onChange={(e) => patchDraft(draft.id, { species: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input" value={draft.tempName} onChange={(e) => patchDraft(draft.id, { tempName: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <select className="field-input" value={draft.sex} onChange={(e) => patchDraft(draft.id, { sex: e.target.value as Sex })}>
                        {SEXES.map((sex) => (
                          <option key={sex} value={sex}>
                            {sex}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <select className="field-input" value={draft.stage} onChange={(e) => patchDraft(draft.id, { stage: e.target.value as Stage })}>
                        {STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input w-20" value={draft.bodyLength} onChange={(e) => patchDraft(draft.id, { bodyLength: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <select
                        className="field-input"
                        value={draft.method}
                        onChange={(e) => patchDraft(draft.id, { method: e.target.value as CollectMethod })}
                      >
                        {COLLECT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <input className="field-input w-16" value={draft.quantity} onChange={(e) => patchDraft(draft.id, { quantity: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => setDrafts((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== draft.id) : prev))}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <span className="field-label">批次备注</span>
            <input
              className="field-input"
              value={drafts[0]?.note ?? ''}
              onChange={(e) => setDrafts((prev) => prev.map((row) => ({ ...row, note: e.target.value })))}
              placeholder="如 灯诱 20:30–22:00，翅面有磨损"
            />
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="text-sm text-field-700">{message}</p> : null}

          <div className="flex gap-2">
            <button className="btn-primary" type="button" onClick={() => void submit()}>
              提交本批次（{drafts.length} 条）
            </button>
            <button className="btn-ghost" type="button" onClick={() => setDrafts([newDraft()])}>
              重置批次
            </button>
          </div>
        </div>
      </section>

      {justCreated.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">刚刚登记的现场标本（待交接）</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {justCreated.map((specimen) => (
              <SpecimenCard key={specimen.id} specimen={specimen} site={site} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
