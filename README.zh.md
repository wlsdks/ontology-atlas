[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh.md)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark@2x.png" />
    <img src="public/brand/lockup-light@2x.png" alt="Ontology Atlas" width="360" />
  </picture>
</h1>

<p align="center"><strong>AI 智能体改动代码时，你依然能看懂自己的系统。</strong></p>

![已选中 Online Store 项目的 Ontology Atlas macOS 应用：该项目的领域名称环绕在周围，无关内容淡出，检查器中显示项目记录和代码证据状态](docs/assets/readme/topology-overview.png)

<p align="center">
  <a href="https://ontologyatlas.com/en/download/"><strong>下载 macOS 版</strong></a> ·
  <a href="https://ontologyatlas.com/en/download/">Windows x64 测试版</a> <sub>未签名</sub> ·
  <a href="https://ontologyatlas.com/en/topology/">在浏览器中试用</a> ·
  <a href="https://ontologyatlas.com/en/guide/">指南</a>
</p>

<p align="center"><a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a> <a href="https://mcpservers.org/servers/wlsdks/ontology-atlas"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" height="20" /></a></p>

- **macOS**（Apple Silicon 和 Intel）版已签名并通过公证，应用内置 MCP 服务器。
- **Windows x64** 是未签名的测试版：SmartScreen 可能会发出警告，受管理的电脑也可能阻止运行。
- **Linux** 暂时没有应用：请使用浏览器版，或在[源码检出](cli/README.md#set-up-from-a-source-checkout)中运行 CLI 和 MCP 服务器。

[下载页面](https://ontologyatlas.com/en/download/)列出了每个版本的版本号、文件大小和校验和，[GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases) 中也有相同的文件。下文链接的站点页面和仓库文档均为英文。

## 它能做什么

- **为你的编码智能体提供任务上下文。** Claude Code、Codex、Cursor 和 Antigravity 通过 MCP 连接，读取任务涉及的能力、代码路径、依赖关系、证据和未知项。
- **把这些语义保存在你自己的 Markdown 中。** 仓库里的 `atlas/` 文件夹为每个概念保存一个文件，历史记录和评审都由 Git 负责。
- **最终决定权在你。** 提议的变更以 Markdown diff 的形式送达，你可以保留、修改或拒绝。
- **让人看到同一个文件夹。** 地图、文档、资料库、洞察和 Git 历史，读取的都是这些文件。
- **不知道的，就说不知道。** 地图上的连线只是声明过的关系，并不能证明运行时的影响。缺少证据时显示为未知，而不是安全。

**尚未证实：** 重新评分后，我们的基准测试没有测出使用 Atlas 在回答质量上的差异，而且使用 Atlas 更慢（[更正说明](docs/benchmark/FINDINGS-2026-08-31-metric-split.md)）。

## 快速开始

1. **安装**：从[下载页面](https://ontologyatlas.com/en/download/)获取应用，或打开[浏览器版](https://ontologyatlas.com/en/topology/)。
2. **打开文件夹**：Atlas 会原地读取其中的 Markdown，或在你的仓库中新建 `atlas/` 文件夹，并且在写入任何内容之前先显示路径。
3. **连接智能体**：在 **Agents › MCP** 中，为你使用的工具点击 **Connect**，重启智能体，然后问问它你的下一个任务。

## 文件夹结构

```text
your-repo/
├── src/
└── atlas/                 ← 与代码一起克隆、建分支、评审
    ├── project.md
    ├── domains/  capabilities/  elements/
    ├── sources/           按收到时的原样保存的文档
    └── wiki/              据这些文档撰写的页面，每条事实都有出处
```

frontmatter 中带有 `kind:` 的 Markdown 文件就是一个概念。它的 `uid` 永不改变，`slug` 是它当前的地址，`path` 指向它所描述的代码。一个文件夹可以容纳任意数量的概念。

延伸阅读：[What becomes a node?](docs/guide/what-becomes-a-node.md)、[Relations](docs/guide/relations.md) 和[规范](docs/ONTOLOGY-ATLAS-SPEC.md)。

## 与编码智能体协作

- **MCP**（Model Context Protocol）：你的智能体会启动 Atlas MCP 服务器，由它直接读写磁盘上的文件夹，应用关闭时也能工作。[连接智能体](docs/guide/connect-agent.md) · [MCP 参考](mcp/README.md)
- **ACP**（Agent Client Protocol）：Claude Agent 和 Codex 也可以在应用自带的对话中工作。读取直接放行，每次 Atlas 写入都要等你允许一次后才会执行。[Agents 界面](docs/features/agents.md)

## 本地优先与隐私

- Atlas 没有后端、账号或遥测。你的文件夹以普通 Markdown 的形式保存在你的磁盘上。
- Atlas 使用你的 API key 或本地模型调用模型的功能需要主动开启，每次调用的目的地都会记录在 `.ontology-atlas/llm-audit.jsonl` 中。
- 已连接的编码智能体可能会把你的提示词和它读取的上下文发送给它自己的提供方，该日志不涵盖这些传输。

[信任](docs/guide/trust.md) · [安全](SECURITY.md)

## CLI

CLI 在源码检出中使用 Node.js 24 运行，命令为 `node cli/src/index.mjs`，没有 npm 包。它可以创建、校验、编译和查询一个文件夹，并通过 `mcp-verify` 验证与智能体的连接是否有效。[CLI 参考](cli/README.md)

## 开发

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，外部的 pull request 请从 fork 提交。[AGENTS.md](AGENTS.md) 是人和智能体共同遵守的约定。
用 `pnpm install` 和 `pnpm dev` 开始，用 `pnpm checks:changed -- --run` 检查改动，用 `pnpm pr:land <number>` 合入。
仓库命令列表见英文 README 的 [Development](README.md#development) 一节，完整的检查说明见 [Development checks](docs/DEVELOPMENT-CHECKS.md)。

## 许可证

[MIT](LICENSE)。第三方声明见 [NOTICE.md](NOTICE.md)，许可证全文见 [public/third-party-licenses.txt](public/third-party-licenses.txt)。
