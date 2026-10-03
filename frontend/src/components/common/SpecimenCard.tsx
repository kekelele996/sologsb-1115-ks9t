import { useState, type ReactNode } from 'react'
import type { CollectSite, Specimen } from '@/types'
import { specimenTaxon } from '@/utils/codec'
import { specimenStore } from '@/stores/specimenStore'
import StatusTag from './StatusTag'

export interface SpecimenCardProps {
  specimen: Specimen
  site?: CollectSite
  /** 是否处于选中态 */
  selected?: boolean
  /** 左上角勾选（批量操作） */
  selectable?: boolean
  onToggle?: (id: string) => void
  onOpen?: (specimen: Specimen) => void
  /** 卡片底部自定义操作区 */
  footer?: ReactNode
  /** 是否允许队里直接修改现场编号（改号留痕、馆藏号不动） */
  editableFieldNo?: boolean
}

/** 标本摘要卡片：馆藏号为主标识，现场号/采集队为现场侧信息 */
export default function SpecimenCard({
  specimen,
  site,
  selected = false,
  selectable = false,
  onToggle,
  onOpen,
  footer,
  editableFieldNo = false
}: SpecimenCardProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(specimen.fieldNo)
  const [hint, setHint] = useState('')

  const startEdit = (): void => {
    setDraft(specimen.fieldNo)
    setHint('')
    setEditing(true)
  }

  const saveFieldNo = async (): Promise<void> => {
    const next = draft.trim()
    if (!next) {
      setHint('现场编号不能为空')
      return
    }
    if (next === specimen.fieldNo) {
      setEditing(false)
      return
    }
    try {
      await specimenStore.getState().renameFieldNo(specimen.id, next)
      setHint('')
      setEditing(false)
    } catch (error) {
      setHint(error instanceof Error ? error.message : '保存失败')
    }
  }

  return (
    <article
      data-testid="specimen-card"
      className={`flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm transition ${
        selected ? 'border-field-500 ring-1 ring-field-500' : 'border-slate-200 hover:border-field-100'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {selectable ? (
            <input
              type="checkbox"
              aria-label={`选择标本 ${specimen.accessionNo || specimen.fieldNo}`}
              className="mt-1 h-4 w-4 accent-field-600"
              checked={selected}
              onChange={() => onToggle?.(specimen.id)}
            />
          ) : null}
          <div>
            <button
              type="button"
              onClick={() => onOpen?.(specimen)}
              className="text-left font-mono text-sm font-semibold text-field-700 hover:underline"
            >
              {specimen.accessionNo || '未交接（待配馆藏号）'}
            </button>
            <p className="text-sm text-slate-700">{specimenTaxon(specimen)}</p>
            <p className="text-xs text-slate-500">
              {specimen.order}
              {specimen.family ? ` · ${specimen.family}` : ''} · {specimen.sex} · {specimen.stage} ·{' '}
              {specimen.bodyLength} mm
            </p>
          </div>
        </div>
        <StatusTag status={specimen.status} />
      </header>

      <dl className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-slate-400">现场号</dt>
          <dd className="truncate font-mono" title={specimen.fieldNo}>
            {specimen.fieldNo || '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-slate-400">采集队</dt>
          <dd className="truncate">{specimen.team || '—'}</dd>
        </div>
        {specimen.fieldNoHistory.length > 0 ? (
          <div className="mt-1 border-t border-slate-200 pt-1 text-[10px] text-slate-400">
            旧号留痕：
            {specimen.fieldNoHistory.map((change, index) => (
              <span key={index} className="mr-1 font-mono">
                {change.from} → {change.to}
              </span>
            ))}
          </div>
        ) : null}
        {editableFieldNo ? (
          <div className="mt-1.5">
            {editing ? (
              <div className="flex flex-col gap-1">
                <div className="flex gap-1">
                  <input
                    className="field-input h-7 font-mono text-[11px]"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-primary px-2 py-1 text-[11px]" type="button" onClick={() => void saveFieldNo()}>
                    保存
                  </button>
                  <button className="btn-ghost px-2 py-1 text-[11px]" type="button" onClick={() => setEditing(false)}>
                    取消
                  </button>
                </div>
                {hint ? <p className="text-[10px] text-rose-600">{hint}</p> : null}
                <p className="text-[10px] text-slate-400">已配好的馆藏号不会跟着变，旧号自动留痕</p>
              </div>
            ) : (
              <button className="btn-ghost px-2 py-1 text-[11px]" type="button" onClick={startEdit}>
                修改现场编号
              </button>
            )}
          </div>
        ) : null}
      </dl>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
        <div>
          <dt className="text-slate-400">采集地</dt>
          <dd>{site ? site.name : '未关联采集地'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">采集日期</dt>
          <dd>{specimen.collectDate}</dd>
        </div>
        <div>
          <dt className="text-slate-400">采集方式</dt>
          <dd>
            {specimen.method} × {specimen.quantity}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">采集人</dt>
          <dd>{specimen.collector || '—'}</dd>
        </div>
      </dl>
      {specimen.note ? <p className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">{specimen.note}</p> : null}
      {footer ? <footer className="mt-1 flex flex-wrap gap-2">{footer}</footer> : null}
    </article>
  )
}
