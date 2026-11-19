# 通过 MCP 连接编码智能体

本章介绍如何通过 MCP（Model Context Protocol，模型上下文协议）把 Claude Code、Codex、Cursor 或 Antigravity 等编码智能体连接到你的本体文件夹。连接之后，智能体可以在改代码之前读取你的代码库本体，也可以把新的概念和关系写进地图所用的同一批 Markdown 文件。

## 智能体连接的是文件夹

会话需要时，你的智能体会在你的电脑上启动 Atlas MCP 服务器；会话结束时，服务器随之停止。服务器读写的是你本体文件夹中的 Markdown 文件。它不打开任何端口，自身也不发出任何网络请求。智能体本身仍会像平常一样与它自己的模型服务商通信。

这带来三个结果：

- Atlas 应用关闭时，智能体也能读取文件夹。
- 智能体写下的内容会出现在地图上，因为地图读取的就是同一批文件。
- 连接本身是你文件夹中的一个配置文件，所以它和其他改动一样会出现在 `git diff` 中。

## 从应用连接

1. 在应用中打开你的本体文件夹。
2. 在侧边栏中选择 **智能体**，再打开 **MCP** 标签页。
3. 在 **将此文件夹连接到智能体** 下，找到你所用工具的那一行，按下 **连接**。

| 工具 | 按钮写入的文件 |
|---|---|
| Claude Code | `.mcp.json` |
| Codex | `.codex/config.toml` |
| Cursor | `.cursor/mcp.json` |
| Antigravity | `.agents/mcp_config.json` |

每个按钮只写入对应工具自己的文件，而且只在该文件不存在时才写。应用从不覆盖已经存在的文件。配置指向应用内置的 MCP 服务器，并包含文件夹的绝对路径，因此你不需要 Node.js，也不需要 Atlas 源码的本地克隆。

如果 `.mcp.json` 或 `.codex/config.toml` 已经存在，但不是 Atlas 的连接文件，那一行会显示警告，并提供一份修正后的配置供你复制。请先读一遍，再自己合并到你的文件里。

然后退出并重新打开你的智能体。智能体只在会话开始时读取 MCP 配置。

在浏览器中，Atlas 无法保存配置文件，因为网页不知道文件夹的绝对路径。这时 MCP 标签页会请你填写这个路径和 Atlas 源码本地克隆的路径，然后生成配置文本，供你复制保存。整个过程不写入也不发送任何内容。桌面应用更省事：[在这里下载](https://ontologyatlas.com/zh/download/)。

## 从源码克隆连接

不用应用时（例如在 Linux 上），可以从仓库的本地克隆运行服务器。你需要 Git、Node.js 24 和 pnpm：

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

然后在你自己仓库的根目录下，为一个已有的本体文件夹写入配置：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs agent-setup ./atlas --write
```

`agent-setup` 会为 Claude Code 创建或修复 `.mcp.json`，为 Codex 创建或修复 `.codex/config.toml`。它只修改 `ontology-atlas` 这一项，保留你的其他 MCP 服务器。无法解析的文件会保持原样，命令会打印一份模板，供你手动合并。

其他任何通过 stdio 使用 MCP 的客户端，都可以用同样的三个字段注册该服务器：

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"],
      "env": { "OATLAS_VAULT": "/absolute/path/to/your/atlas" }
    }
  }
}
```

请使用绝对路径。配置文件不会展开 `~`。Codex 也可以全局注册该服务器：

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/your/atlas -- node /absolute/path/to/ontology-atlas/mcp/src/index.js
```

Codex 只有在你信任某个项目文件夹之后，才会读取该项目的 `.codex/config.toml`。信任之后，`codex mcp list` 里应该能看到 `ontology-atlas`。

如果只想给某个客户端只读权限，就在 `env` 中加上 `"OATLAS_READ_ONLY": "1"`。这样服务器只列出读取类工具，并拒绝所有写入。

## 检查连接

磁盘上有配置文件，并不能证明智能体已经加载了它。重启之后，问智能体：

> 调用 connection_info，告诉我你连接的是哪个本体文件夹、哪个代码仓库。

`connection_info` 会返回服务器解析出的文件夹路径和仓库路径，以及它提供的工具。如果文件夹不是你预期的那个，请先修正配置，再让智能体写入。

在应用中，标题旁的 **确认连接** 会显示重启步骤以及每个工具配置文件的状态。在终端里，`mcp-verify` 会启动服务器、列出它的工具，并对文件夹执行真实的查询：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs mcp-verify ./atlas
```

它能证明服务器和文件夹工作正常，但不能证明你的智能体已经加载了配置。

## 智能体能读写什么

服务器自己的工具列表才是准确的清单。这些工具大致分为几组：

- **工作前读取：** `get_concept` 返回一个概念及其相邻概念，`find_backlinks` 显示哪些概念指向某个概念，`find_path` 显示两个概念如何相连，`query_ontology` 回答诸如工作区概览或一次改动的影响范围之类的问题。
- **读取代码：** `analyze_repo_structure`、`index_project` 和 `infer_imports` 会扫描仓库，但不写入任何内容。
- **写入：** `add_concepts`、`add_relations`、`patch_concept`、`rename_concept`、`merge_concepts`、`delete_concept` 等。重命名、合并、删除以及移除关系时，会先预览改动，只有在带确认参数再次调用时才真正写入。
- **检查：** `validate_vault` 和 `compile_ontology` 报告失效的引用和缺失的部分。

每次写入的结果都是一处 Markdown 改动。如果智能体传入读取时拿到的 `expected_mtime`，而磁盘上的文件在那之后又改过，写入工具就会拒绝覆盖；不传则照常写入。

## 仍然由你决定的事

- **写入是否需要你的批准。** 对外部智能体来说，这由它自己的权限设置决定。在应用内置的智能体对话中，每次写入都会先询问你，除非你开启了 **自动批准**。
- **含义是否正确。** 写入成功并不等于含义被接受。提交之前请先阅读 diff。
- **智能体处理什么。** 在地图上，概念操作中的 **复制提示词** 会复制该概念的上下文，方便你交给智能体。

同一页面上的 **智能体** 标签页会列出在你电脑上找到的编码工具，并检查它们能否运行。在应用中，还可以在地图旁边和其中某个工具对话，用的是同一个 MCP 服务器。

下一步：[从代码构建第一张地图](/guide/from-your-repo)。关于哪些内容会离开你的电脑，请看 [数据、隐私与安全](/guide/trust)。
