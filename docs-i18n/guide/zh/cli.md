# CLI 及其与 MCP 的关系

本章介绍 Ontology Atlas 的命令行工具：如何运行它、日常常用的命令，以及它如何与 Claude Code、Codex 等编码智能体调用的 MCP 服务器共用同一个引擎。CLI 所做的一切，都作用于地图所显示的同一个 Markdown 本体文件夹。

## 从源码检出目录运行

Atlas 没有 npm 包，所以 `npx` 不可用。CLI 需要从仓库的克隆中运行，依赖 Git、Node.js 24 和 pnpm。请把克隆放在你要描述的那个仓库之外：

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

两条安装命令都需要运行，因为 `mcp` 文件夹有自己的锁文件。之后用 `node` 运行任意命令：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

如果想直接输入 `atlas`，`install-shim` 会在 `~/.local/bin/atlas` 写入一个指向此克隆的单行启动脚本。它在写入之前会先打印脚本内容，`install-shim --uninstall` 可以将其移除。

连接智能体并不需要 CLI。桌面应用自带一份 MCP 服务器，并会替你写好智能体配置（见 [连接编码智能体](/guide/connect-agent)）。

## 一个引擎，三个入口

| 入口 | 谁在用 |
|---|---|
| 应用或网站中的地图 | 人 |
| MCP 工具 | 编码智能体 |
| CLI | 在终端中工作的人和脚本 |

图相关的命令，例如 `backlinks`、`blast-radius`、`rename` 和 `relate`，会为一次调用启动 MCP 服务器，用完再停止。因此，你在终端里运行的命令和智能体调用的同一个工具会给出相同的答案，并遵循相同的写入规则。如果文件夹很大导致这些命令超时，可以用 `OATLAS_CLI_MCP_TIMEOUT_MS` 延长等待时间。

## 起步命令

| 任务 | 命令 |
|---|---|
| 创建带起步文件和智能体配置的本体文件夹 | `init ./atlas` |
| 修复已有文件夹的智能体配置 | `agent-setup ./atlas --write` |
| 检查 MCP 服务器能否启动并响应 | `mcp-verify ./atlas` |
| 预览仓库中的候选概念 | `bootstrap . --vault ./atlas` |
| 把 `CLAUDE.md` 或 `AGENTS.md` 转成概念 | `absorb CLAUDE.md --vault ./atlas` |
| 导入已有的 Markdown 文件 | `import <path...> --vault ./atlas` |

`bootstrap`、`analyze`、`index` 和 `infer-imports` 只做预览。它们不写入任何概念，`bootstrap` 还会以退出码 3 结束，表示仍需批准。概念本身来自一个由你审查的智能体，详见 [从代码构建第一张地图](/guide/from-your-repo)。

## 查询命令

这些命令只读取，可以随意运行。

| 问题 | 命令 |
|---|---|
| 这个概念是什么，有哪些概念与它相连？ | `node <slug> ./atlas` |
| 哪些概念指向这个概念？ | `backlinks <slug> --vault ./atlas` |
| 如果它变了，可能会影响什么？ | `blast-radius <slug> --vault ./atlas` |
| 这两个概念是如何相连的？ | `path <from> <to> --vault ./atlas` |
| 是否已经有类似的东西？ | `similar "<title>" ./atlas` |
| 哪些概念符合某个条件？ | `query "kind=capability AND has(elements)" --vault ./atlas` |
| 整个文件夹是什么样子？ | `overview ./atlas` |
| 下一步该修什么？ | `maintenance ./atlas` |

## 写入命令

| 任务 | 命令 | 默认行为 |
|---|---|---|
| 添加概念 | `add <kind> <slug> --title "..." --vault ./atlas` | 直接写入 |
| 添加关系 | `relate <from> <to> <type> --why "..." --vault ./atlas` | 直接写入；`--dry-run` 预览 |
| 移除关系 | `remove-relation <from> <to> <type>` | 直接写入；`--dry-run` 预览 |
| 重命名概念及其引用 | `rename <old> <new> --vault ./atlas` | 预览；`--confirm` 执行 |
| 合并两个概念 | `merge <from> <into> --vault ./atlas` | 预览；`--confirm` 执行 |
| 删除概念 | `delete <slug> --vault ./atlas` | 预览；仍有引用时拒绝执行 |

每次写入之前，先运行对应的读取命令。`relation-check` 会在 `relate` 之前按模式检查一条关系，`backlinks` 会显示重命名或删除将会涉及哪些内容。

## 检查命令

| 问题 | 命令 |
|---|---|
| Markdown 是否有效，引用能否解析？ | `validate ./atlas` |
| 被引用的源文件是否仍然存在，图是否完好？ | `health ./atlas` |
| 哪些概念没有任何概念指向？ | `orphans ./atlas` |
| 依赖关系是否形成了环？ | `cycles ./atlas` |
| 我暂存的文件涉及哪些概念？ | `preflight ./atlas --staged` |

`validate` 只读取本体文件夹。`health` 还会把被引用的路径与代码进行比对，因此能发现那些依据已被重构删除的概念。`validate` 发现错误时以退出码 1 结束，因此适合放进 CI。`preflight` 从不阻止提交。

## 面向智能体和共享的命令

| 任务 | 命令 |
|---|---|
| 给新的智能体会话提供起始上下文 | `agent-brief ./atlas` |
| 在一屏内查看状态和下一步操作 | `workspace-brief ./atlas` |
| 只提交本体文件夹，并附上摘要 | `snapshot ./atlas` |
| 导出图谱 | `export ./atlas --format jsonld`（或 `graphml`、`json`） |

只要文件夹仍有需要处理的问题，`agent-brief` 就会以退出码 1 结束，例如刚运行完 `init` 时。但它的输出仍然是完整的。`snapshot` 只创建本地提交；加上 `--push` 会把它推送到该分支已有的上游，加上 `--dry-run` 则只做预览。

几乎所有命令都接受 `--json`，便于脚本使用。完整的命令列表及所有选项见帮助：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

要在代码变化时用这些命令让地图保持最新，请看 [在代码变化时让地图保持最新](/guide/growing-vault)。
