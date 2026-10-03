import { NavLink, Outlet } from 'react-router-dom'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { siteStore } from '@/stores/siteStore'
import { storageStore } from '@/stores/storageStore'
import { determinationStore } from '@/stores/determinationStore'
import { accessionStore } from '@/stores/accessionStore'

const NAV = [
  { to: '/specimens', label: '标本清单', hint: '馆藏号 / 改现场号' },
  { to: '/collect', label: '采集登记', hint: '队名 + 现场编号' },
  { to: '/handover', label: '馆队交接', hint: '配对配发馆藏号' },
  { to: '/sites', label: '采集地管理', hint: '坐标校验 / 合并' },
  { to: '/determination', label: '鉴定工作流', hint: '认馆藏号' },
  { to: '/storage', label: '保藏柜位图', hint: '柜-屉-盒-位' }
]

/** 应用外壳：左侧导航 + 顶部状态条 + 路由出口 */
export default function AppLayout(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const storages = usePersistentStore(storageStore, (state) => state.rows)
  const determinations = usePersistentStore(determinationStore, (state) => state.rows)
  const accessions = usePersistentStore(accessionStore, (state) => state.rows)

  const pending = specimens.filter((item) => item.status === '待鉴定').length
  const pendingHandover = specimens.filter((item) => !item.accessionNo).length
  const accessioned = accessions.length

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-field-700 px-3 py-5 text-field-50">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-field-100 text-lg font-bold text-field-700">
            ⌘
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">昆虫标本采集记录台</p>
            <p className="truncate text-[10px] text-field-100/80">Insect Specimen Log</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-field-600 text-white' : 'text-field-100 hover:bg-field-600/60'
                }`
              }
            >
              <span className="block">{item.label}</span>
              <span className="block text-[11px] text-field-100/70">{item.hint}</span>
            </NavLink>
          ))}
        </nav>
        <dl className="mt-auto space-y-1 rounded-xl bg-field-600/50 p-3 text-xs">
          <div className="flex justify-between">
            <dt>现场标本</dt>
            <dd className="font-semibold">{specimens.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>已配馆藏号</dt>
            <dd className="font-semibold">{accessioned}</dd>
          </div>
          <div className="flex justify-between">
            <dt>待交接</dt>
            <dd className="font-semibold">{pendingHandover}</dd>
          </div>
          <div className="flex justify-between">
            <dt>待鉴定</dt>
            <dd className="font-semibold">{pending}</dd>
          </div>
          <div className="flex justify-between">
            <dt>采集地</dt>
            <dd className="font-semibold">{sites.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>已入柜</dt>
            <dd className="font-semibold">{storages.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>鉴定记录</dt>
            <dd className="font-semibold">{determinations.length}</dd>
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-field-100/70">
            数据保存在浏览器 IndexedDB，无需后端服务
          </p>
        </dl>
      </aside>
      <main className="flex-1 bg-[#f5f8f6]">
        <div className="mx-auto max-w-[1180px] px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
