import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DetStatus, Specimen } from '@/types'
import { DET_STATUSES } from '@/types'
import SpecimenCard from '@/components/common/SpecimenCard'
import StatusTag from '@/components/common/StatusTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { useSpecimenFilter } from '@/hooks/useSpecimenFilter'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { downloadCsv } from '@/utils/export'
import { specimenTaxon } from '@/utils/codec'

/** 标本清单：组合筛选 + 多选批量推进鉴定状态；导出认馆藏号 */
export default function SpecimensPage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const { filter, setFilter, reset, filtered, hitCount, orders, families } = useSpecimenFilter(specimens)
  const [selected, setSelected] = useState<string[]>([])
  const [batchStatus, setBatchStatus] = useState<DetStatus>('初鉴')
  const [message, setMessage] = useState('')

  // 修改现场编号
  const [renaming, setRenaming] = useState<Specimen | null>(null)
  const [nextFieldNo, setNextFieldNo] = useState('')
  const [renameError, setRenameError] = useState('')

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleAll = (): void => {
    setSelected((prev) => (prev.length === filtered.length ? [] : filtered.map((item) => item.id)))
  }

  const applyBatch = async (): Promise<void> => {
    if (selected.length === 0) {
      setMessage('请先勾选要推进状态的标本')
      return
    }
    await specimenStore.getState().bulkSetStatus(selected, batchStatus)
    setMessage(`已把 ${selected.length} 份标本推进为「${batchStatus}」`)
    setSelected([])
  }

  const exportList = (): void => {
    const rows = filtered.map((item: Specimen) => ({
      accessionNo: item.accessionNo || '',
      team: item.team,
      fieldNo: item.fieldNo,
      taxon: specimenTaxon(item),
      site: siteMap.get(item.siteId)?.name ?? '',
      collectDate: item.collectDate,
      method: item.method,
      quantity: item.quantity,
      status: item.status,
      determiner: item.determiner
    }))
    downloadCsv('标本清单.csv', rows as unknown as Record<string, unknown>[], [
      { key: 'accessionNo', label: '馆藏号' },
      { key: 'team', label: '采集队' },
      { key: 'fieldNo', label: '现场编号' },
      { key: 'taxon', label: '分类阶元' },
      { key: 'site', label: '采集地' },
      { key: 'collectDate', label: '采集日期' },
      { key: 'method', label: '采集方式' },
      { key: 'quantity', label: '数量' },
      { key: 'status', label: '鉴定状态' },
      { key: 'determiner', label: '鉴定人' }
    ])
  }

  const openRename = (specimen: Specimen): void => {
    setRenaming(specimen)
    setNextFieldNo(specimen.fieldNo)
    setRenameError('')
  }

  const confirmRename = async (): Promise<void> => {
    if (!renaming) return
    const outcome = await specimenStore.getState().renameFieldNo(renaming.id, nextFieldNo)
    if (!outcome.ok) {
      setRenameError(outcome.message ?? '修改失败')
      return
    }
    setMessage(
      `现场编号已由「${renaming.fieldNo}」改为「${nextFieldNo.trim()}」，旧号已留痕；馆藏号 ${
        renaming.accessionNo || '尚未配发'
      } 不变。`
    )
    setRenaming(null)
  }

  const statusCount = (status: DetStatus): number => specimens.filter((item) => item.status === status).length

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">标本清单</h1>
          <p className="page-sub">
            馆藏号是馆方主标识（柜位、鉴定、导出都认它）；采集队名+现场编号仅作现场追溯，可在卡片上修改，旧号自动留痕。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/collect">
            去采集登记
          </Link>
          <Link className="btn-ghost" to="/handover">
            去馆队交接
          </Link>
          <button className="btn-ghost" type="button" onClick={exportList}>
            导出命中清单
          </button>
        </div>
      </header>

      <section className="panel flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">目</span>
          <select className="field-input w-36" value={filter.order} onChange={(e) => setFilter({ order: e.target.value })}>
            <option value="">全部</option>
            {orders.map((order) => (
              <option key={order} value={order}>
                {order}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">科</span>
          <select
            className="field-input w-36"
            value={filter.family}
            onChange={(e) => setFilter({ family: e.target.value })}
          >
            <option value="">全部</option>
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">鉴定状态</span>
          <select
            className="field-input w-32"
            value={filter.status}
            onChange={(e) => setFilter({ status: e.target.value as DetStatus | '' })}
          >
            <option value="">全部</option>
            {DET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">采集地</span>
          <select
            className="field-input w-48"
            value={filter.siteId}
            onChange={(e) => setFilter({ siteId: e.target.value })}
          >
            <option value="">全部</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">采集日期起</span>
          <input
            type="date"
            className="field-input w-40"
            value={filter.dateFrom}
            onChange={(e) => setFilter({ dateFrom: e.target.value })}
          />
        </div>
        <div>
          <span className="field-label">采集日期止</span>
          <input
            type="date"
            className="field-input w-40"
            value={filter.dateTo}
            onChange={(e) => setFilter({ dateTo: e.target.value })}
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <span className="field-label">关键字（馆藏号/队名/现场号/学名/暂定名/采集人）</span>
          <input
            className="field-input"
            placeholder="如 QLB-2026 / 黔南一队 / 步甲 / 陆昀"
            value={filter.keyword}
            onChange={(e) => setFilter({ keyword: e.target.value })}
          />
        </div>
        <button className="btn-ghost" type="button" onClick={reset}>
          重置
        </button>
      </section>

      <section className="panel flex flex-wrap items-center gap-3">
        <button className="btn-ghost" type="button" onClick={toggleAll}>
          {selected.length === filtered.length && filtered.length > 0 ? '取消全选' : '全选命中'}
        </button>
        <span className="text-sm text-slate-600">
          命中 <b data-testid="hit-count">{hitCount}</b> / {specimens.length} 份，已选 {selected.length} 份
        </span>
        <select
          className="field-input w-32"
          value={batchStatus}
          onChange={(e) => setBatchStatus(e.target.value as DetStatus)}
        >
          {DET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="button" onClick={() => void applyBatch()}>
          批量推进状态
        </button>
        <div className="ml-auto flex flex-wrap gap-2 text-xs text-slate-500">
          {DET_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-center gap-1">
              <StatusTag status={status} /> {statusCount(status)}
            </span>
          ))}
        </div>
        {message ? <p className="w-full text-sm text-field-700">{message}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((specimen) => (
          <SpecimenCard
            key={specimen.id}
            specimen={specimen}
            site={siteMap.get(specimen.siteId)}
            selectable
            selected={selectedSet.has(specimen.id)}
            onToggle={toggle}
            footer={
              <>
                <button className="btn-ghost" type="button" onClick={() => openRename(specimen)}>
                  改现场编号
                </button>
                <Link className="btn-ghost" to="/determination">
                  去鉴定
                </Link>
                <Link className="btn-ghost" to="/storage">
                  去入柜
                </Link>
              </>
            }
          />
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            没有命中的标本，调整筛选条件或去「采集登记」新增
          </p>
        ) : null}
      </section>

      {renaming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel w-full max-w-md">
            <h2 className="text-sm font-semibold text-slate-800">修改现场编号（采集队侧）</h2>
            <dl className="mt-2 space-y-1 text-xs text-slate-600">
              <div>采集队：{renaming.team}</div>
              <div>
                现现场编号：<span className="font-mono">{renaming.fieldNo}</span>
              </div>
              <div>
                馆藏号：
                <span className="font-mono text-field-700">{renaming.accessionNo || '尚未配发'}</span>
                <span className="text-slate-400">（改现场号不会动馆藏号）</span>
              </div>
              {renaming.fieldNoHistory.length > 0 ? (
                <div>旧号留痕：{renaming.fieldNoHistory.map((item) => `${item.value}（${item.changedAt}）`).join('、')}</div>
              ) : null}
            </dl>
            <input
              className="field-input mt-3 font-mono text-sm"
              value={nextFieldNo}
              autoFocus
              onChange={(e) => setNextFieldNo(e.target.value)}
              data-testid="rename-field-no-input"
            />
            {renameError ? <p className="mt-2 text-xs text-rose-600">{renameError}</p> : null}
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" type="button" onClick={() => void confirmRename()}>
                确认修改（旧号留痕）
              </button>
              <button className="btn-ghost" type="button" onClick={() => setRenaming(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
