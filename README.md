# 昆虫标本采集记录台（gbinsectlog）

面向野外昆虫调查队与标本馆技术员，把「标本采集 → 采集地与生境 → 鉴定状态 → 保藏位置」串成一条可追溯的编目链路，解决采集标签手写易错、鉴定进度无人跟踪、标本入柜后找不到位置的问题。**纯前端单页应用**，全部数据保存在浏览器 IndexedDB，不依赖任何后端服务或外部接口。

## 一、Docker 一键启动（推荐）

```bash
cp .env.example .env      # 首次启动先复制环境变量文件
docker compose up -d --build
```

启动后访问：<http://localhost:21815>

常用命令：

```bash
docker compose ps        # 查看容器状态
docker compose logs -f   # 查看日志
docker compose down      # 停止并移除容器（数据在浏览器本地，不受影响）
```

端口与项目名可在 `.env` 中调整：

```
COMPOSE_PROJECT_NAME=gbinsectlog
FRONTEND_PORT=21815
```

## 二、技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | React 18 |
| 语言 | TypeScript（`tsc --noEmit` 类型检查零错误） |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand |
| 路由 | React Router 6（nginx `try_files` 回落，支持直接刷新子路由） |
| 构建 | Vite 5 |
| 本地存储 | IndexedDB（Dexie 封装，含 `schemaVersion` 与升级迁移） |
| 部署 | 多阶段 Dockerfile：`node:20-alpine` 构建 → `nginx:alpine` 托管 |

## 三、本地开发

```bash
cd frontend
npm install
npm run dev        # http://localhost:21815
npm run build      # 类型检查 + 生产构建
```

> 本地开发无需任何后端服务或环境变量。

## 四、目录结构

```
sologsb-1115/
├── docker-compose.yml          # 顶层 name: gbinsectlog，无 version 字段
├── .env.example                # COMPOSE_PROJECT_NAME / FRONTEND_PORT
├── frontend/
│   ├── Dockerfile              # 多阶段构建，nginx 阶段 chmod -R a+rX 静态资源
│   ├── nginx.conf              # try_files 前端路由回落 + gzip
│   ├── tailwind.config.js / postcss.config.js
│   ├── public/favicon.svg
│   └── src/
│       ├── types/              # specimen.ts / site.ts / storage.ts / determination.ts / index.ts
│       ├── stores/             # specimenStore / siteStore / storageStore / determinationStore（Zustand）
│       ├── components/common/  # SpecimenCard / StatusTag / CabinetGrid / SitePicker
│       ├── hooks/              # usePersistentStore / useSpecimenFilter
│       ├── pages/              # SpecimensPage / SitesPage / CollectPage / HandoverPage / DeterminationPage / StoragePage
│       ├── router/index.tsx
│       └── utils/              # codec.ts（馆藏号/现场号/柜位） / handover.ts（交接配对纯逻辑） / export.ts / id.ts
```

## 五、数据模型与存储

| 模型 | 说明 | Dexie 表 |
| --- | --- | --- |
| Specimen 标本 | 采集队 `team`、现场编号 `fieldNo` 及改号留痕 `fieldNoHistory`、馆藏号 `accessionNo`、目/科/属/种、暂定名、采集日期与人、性别虫态、体长、采集方式、数量、鉴定状态 | `specimens` |
| CollectSite 采集地 | 代码、名称、行政区、经纬度海拔、生境类型、小生境、微气候、采集日期区间 | `sites` |
| Storage 保藏位置 | 保藏方式、柜/抽屉/盒/插位序号、入柜日期、经手人 | `storages` |
| Determination 鉴定记录 | 鉴定人、日期、结论（学名）、依据文献、置信度、是否需复核 | `determinations` |

- 数据库名 `gbinsectlog`，`meta` 表保存 `schemaVersion`；
- `version(2)` 升级迁移会为历史标本补齐默认采集方式（扫网）；
- `version(3)` 把原先挤在一起的编号拆成两套：旧 `code`（馆方规则）在**第一次打开时迁为馆藏号 `accessionNo`**，现场侧 `team / fieldNo / fieldNoHistory` 置空待队里补录，迁移后删除旧 `code` 字段；
- **两套编号各自持有**：`fieldNo` 是采集队按自己规则编的现场号，只在队内唯一，不同队允许同号；`accessionNo` 是馆方馆藏号（`前缀-年份-流水号`，如 `GB-2026-0007`），全局唯一，未交接为空；
- 数据仅存于浏览器本地，容器无状态、不挂载命名卷。

## 六、主要页面

| 路由 | 功能 |
| --- | --- |
| `/specimens` | 标本清单：按目/科、鉴定状态、采集地、采集日期区间与关键字（馆藏号/现场号/队名）组合筛选，多选批量推进鉴定状态，导出命中清单（含两套号） |
| `/collect` | 采集登记：填采集队名，系统按队内进度给现场号建议（可改成队内自有规则），队内查重；此页不产生馆藏号 |
| `/handover` | 标本交接台：粘贴交接单按「队名 + 现场编号」配对馆藏号（可留空自动配号或直接登记指定馆号），实时预检、行级退回、幂等续跑 |
| `/sites` | 采集地管理：经纬度格式校验、各地采集次数统计、50 米内邻近采集地提示与一键合并 |
| `/determination` | 鉴定工作流：待鉴定队列（仅已交接、有馆藏号者）逐条处理，落鉴定记录并自动推进标本状态（已鉴定 / 待复核） |
| `/storage` | 保藏柜位图：柜-抽屉-盒-位三级展开，空位/占用一目了然，拖拽入柜，重复占用给出占用提示（只认馆藏号，未交接标本不入列） |

## 六补、交接与编号约定

- **两套号分离**：采集队持 `team + fieldNo`（现场号，队内唯一，跨队可同号），馆藏持 `accessionNo`（全局唯一）；
- **交接配对**：在 `/handover` 粘贴单据，每行「现场编号」或「现场编号 馆藏号」，系统按**队名 + 现场编号**定位标本，队里改过号的旧号（`fieldNoHistory`）也能对上；
- **行级退回**：现场号写错/找不到、馆藏号格式错、馆藏号已被其他标本占用、单内馆号重复，都**只退回这一行并说明原因**，其余行照常配对落库；
- **失败续跑 / 幂等**：配对在单个 Dexie 事务内按库内最新状态执行；坏行改好后整单重送即从两边各自进度续跑——已配对行幂等跳过、不重复配号，未配行继续配；
- **改号留痕**：队里在清单页修改现场编号时，已配好的馆藏号**绝不跟着变**，旧号写入 `fieldNoHistory`（旧→新 + 时间）；
- **馆方只认馆藏号**：柜位、鉴定队列/记录、CSV 导出均以 `accessionNo` 为主标识，现场号仅随附留档；未交接标本显示「未交接」且不进入入柜/鉴定队列。

## 七、业务约定

- 采集地代码用于标识采集地本身，代码重复会被拒绝；现场编号归采集队、馆藏号归馆方，均不再依赖采集地代码；
- 坐标 50 米内视为同一采集地，页面上给出合并提示，合并会把原采集地标本自动改挂；
- 鉴定记录提交后自动把标本状态推进为「已鉴定」，勾选「需复核」则置为「待复核」；
- 同一柜位（柜-屉-盒-位）只允许一份标本，冲突时列出已有标本的馆藏号。

## 八、本地校验

```bash
cd frontend
npm run verify   # 交接配对纯逻辑 + Dexie 事务幂等/行级隔离 + v2→v3 迁移（fake-indexeddb）
npm run build    # tsc --noEmit 零错误 + 生产构建
```
