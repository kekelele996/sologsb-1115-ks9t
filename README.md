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
│       ├── types/              # specimen / accession / handover / site / storage / determination
│       ├── stores/             # specimen / accession / handover / site / storage / determination（Zustand）
│       ├── services/           # handoverService（逐行配对、幂等重放）
│       ├── components/common/  # SpecimenCard / StatusTag / CabinetGrid / SitePicker
│       ├── hooks/              # usePersistentStore（Dexie v3 迁移）/ useSpecimenFilter
│       ├── pages/              # Specimens / Sites / Collect / Handover / Determination / Storage
│       ├── router/index.tsx
│       └── utils/              # codec.ts（馆藏号/现场号）/ export.ts / id.ts
```

## 五、数据模型与存储

| 模型 | 说明 | Dexie 表 |
| --- | --- | --- |
| Specimen 现场标本（采集队侧） | 采集队名 + 现场编号（队内唯一）、旧现场编号留痕、馆藏号（交接后回填）、目/科/属/种、采集信息、鉴定状态 | `specimens` |
| Accession 配对凭证 | 配对瞬间固化「队名+现场编号」快照、馆藏号（馆内唯一）、交接单号 | `accessions` |
| HandoverBatch 交接单 | 单号即幂等键、原始单据、逐行结果（新配号/回放/退回） | `handoverBatches` |
| CollectSite 采集地 | 代码（馆藏号前缀）、名称、行政区、经纬度海拔、生境、采集日期区间 | `sites` |
| Storage 保藏位置 | 保藏方式、柜/抽屉/盒/插位序号、入柜日期、经手人 | `storages` |
| Determination 鉴定记录 | 鉴定人、日期、结论（学名）、依据文献、置信度、是否需复核 | `determinations` |

- 数据库名 `gbinsectlog`，`meta` 表保存 `schemaVersion`；
- `version(2)` 升级迁移会为历史标本补齐默认采集方式（扫网）；
- `version(3)` 两套编号分家：旧 `code` 首开时迁到 `specimens.accessionNo` 并补齐配对凭证（`legacy-migration`），新增 `accessions` / `handoverBatches` 表；
- **两套编号各归其主**：采集队按自己的规则编现场编号（仅队内查重，不同队同号互不影响）；馆藏号格式为 `采集地代码-年份-流水号`（如 `QLB-2026-0007`），馆队交接时配发；
- 数据仅存于浏览器本地，容器无状态、不挂载命名卷。

## 六、主要页面

| 路由 | 功能 |
| --- | --- |
| `/specimens` | 标本清单：馆藏号为主标识，可改现场编号（旧号留痕、馆藏号不动），组合筛选与批量推进状态，导出命中清单 |
| `/collect` | 采集登记：填采集队名与现场编号（队内查重，留空给建议号），选择采集地带出生境，一次提交多条 |
| `/handover` | 馆队交接：提交一队一单（每行「现场编号」或「现场编号,馆藏号」），逐行配对，坏行只退该行，原单重送不重复配号 |
| `/sites` | 采集地管理：经纬度格式校验、各地采集次数统计、50 米内邻近采集地提示与一键合并 |
| `/determination` | 鉴定工作流：仅已交接（有馆藏号）标本入队，落鉴定记录并推进状态，导出认馆藏号 |
| `/storage` | 保藏柜位图：柜-抽屉-盒-位三级展开，认馆藏号，未交接标本不入柜，重复占用给出占用提示 |

## 七、业务约定

- **编号归属**：现场编号是采集队侧标识（队名命名空间内唯一）；馆藏号是馆方主标识，柜位、鉴定、导出一律认馆藏号；
- **交接配对**：按「队名 + 现场编号」找现场标本；凭证固化配对瞬间的队名/现场号，队里后来改号不影响已配馆藏号；
- **改号留痕**：现场编号可在标本清单修改，旧号写入 `fieldNoHistory`；已配馆藏号不跟着变，旧交接单按凭证快照仍可重放；
- **逐行退回**：交接单内写错现场号、馆藏号格式不对或已被占用，只退回该行并说明原因，其他配对好的行照旧；
- **失败重试**：交接失败后双方按各自进度补送，同一张单（单号不变）重送时已配行走回放、自动号不会多配；
- 采集地代码是馆藏号前缀，代码重复会被拒绝；
- 坐标 50 米内视为同一采集地，页面上给出合并提示，合并会把原采集地标本自动改挂；
- 鉴定记录提交后自动把标本状态推进为「已鉴定」，勾选「需复核」则置为「待复核」；
- 同一柜位（柜-屉-盒-位）只允许一份标本，冲突时列出已有标本馆藏号。
