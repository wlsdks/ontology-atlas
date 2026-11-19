# 本体文件夹：Markdown 文件与顶部信息块

Atlas 本体就是一个由普通 Markdown 文件组成的文件夹。代码库知识图谱中的每个概念是一个 `.md` 文件，文件顶部的 YAML frontmatter 说明这个概念是什么、如何与其他概念相连。本章介绍这种文件格式、Atlas 读取的字段，以及文件应放在哪里。它背后没有数据库：这些文件本身就是本体。

## 一个概念，一个文件

```markdown
---
uid: 7ec556ec-768d-40c3-8147-19db4287a338
slug: capabilities/token-issue
kind: capability
title: Token issuance
display_en: Token issuance
domain: domains/auth
elements: [elements/jwt-signer]
path: src/auth/issue-token.ts
dependencies: [capabilities/session-store]
relation_notes: { capabilities/session-store: "只有在会话写入之后，才会签发令牌。" }
---

登录成功后，签发一个可撤销的会话令牌。

## Includes
- 对令牌签名并返回。

## Excludes
- 检查密码，这属于凭据校验。
```

frontmatter 就是图：类型、名称、上级和关系。正文是人或智能体阅读的含义：定义、这个概念包含和不包含什么、依据，以及仍不确定的内容。

## 字段

| 字段 | 内容 |
|---|---|
| `uid` | 永久身份，一个小写的 UUIDv4。永不改变。 |
| `slug` | 当前可读的地址，例如 `capabilities/token-issue`。关系指向的是 slug。可以重命名。 |
| `kind` | `project`、`domain`、`capability`、`element`、`document` 之一。见 [选择概念](/guide/what-becomes-a-node)。 |
| `title` | 规范名称。在所有语言中，搜索和匹配都使用它。 |
| `display_<locale>` | 在该语言的界面上显示的名称，例如 `display_en`、`display_ko`。 |
| `display` | 可选的短名称，在 `title` 较长时用作标签。 |
| `description` | 可选的一行摘要。 |
| `domain` | 能力或元素的上级领域。应当填写；缺失时给出警告。 |
| `path` | 对于能力或元素，不熟悉的读者应当首先打开的那一个文件或文件夹。 |
| 关系键 | `domains`、`capabilities`、`elements`、`dependencies`、`relates`、`broader`、`contains`、`describes`。见 [关系](/guide/relations)。 |
| `relation_notes` | 每条关系一句话，说明它为什么成立，以目标的 slug 为键。 |
| `created_by` | 谁创建了这个文件：`human`，或者 `agent:` 加上智能体的名称。 |
| `review_state` | 可选。`human_decides` 表示这个概念只能由人来定夺；`confirmed` 记录已有人核对过其含义。 |

每个概念都必须有 `uid`、`slug`、`kind` 和 `title`。能力或元素缺少 `domain` 时只是警告，不是错误，所以尚未完成的文件夹也能打开。

### 身份：uid 与 slug

创建概念的写入方（应用、MCP 服务器或 CLI）会为它生成一次 `uid`。你无需自己选择。重命名概念会改变它的 `slug`，并改写所有指向它的关系，但 `uid` 保持不变。合并两个概念时，保留下来的概念沿用自己的 `uid`，并把被吸收概念的 uid 记录在 `merged_uids` 中，因此旧的 `uid` 仍能找到正确的概念。不要手动编写 `merged_uids`。

编写关系和链接时使用 slug；人们在文件里读到的就是它。当某个工具或交接内容即使在重命名之后也必须指向同一个概念时，使用 `uid`。

### 多语言名称

地图、列表和面板在存在时显示与界面语言对应的 `display_<locale>`，否则回退到规范名称。`title` 在所有语言中都相同，因此搜索和匹配不依赖翻译。如果你的团队用两种语言阅读地图，请把两个名称都填上；缺少某一种时，会显示另一种语言的名称。

## 文件放在哪里

把本体文件夹放在它所描述的仓库里，这样代码改动和相应的含义改动就能在同一个 pull request 中审查。本仓库把自己的本体放在 `docs/ontology/` 中。

```text
your-repo/
├── src/
└── docs/ontology/
    ├── project.md          项目（kind: project）
    ├── domains/            每个领域一个文件
    ├── capabilities/       每项能力一个文件
    ├── elements/           每个元素一个文件
    ├── sources/            原始资料文件，从不作为概念
    └── .ontology-atlas/    应用在本体旁边保存的文件
```

项目和文档位于文件夹的根目录；领域、能力和元素各有自己的文件夹。按照惯例，文件路径与 slug 一致，但 Atlas 信任的地址是 frontmatter 中的 `slug:`。在类型文件夹下，slug 必须是扁平的：写 `elements/jwt-signer`，绝不能写 `elements/src/auth/jwt-signer`。代码位置应写在 `path` 中。

`sources/` 下的文件是原始资料，例如 Wiki 页面引用的文档，从不会被当作概念读取。`.ontology-atlas/` 存放应用在本体旁边写入的文件，例如审阅结果和指向你代码文件夹的链接。Atlas 第一次写入这个链接时，还会在那里添加一个 `.gitignore`，使该文件夹不进入 Git。

在 Atlas 源码的检出目录中，可以这样用命令行创建一个文件夹：

```bash
node cli/src/index.mjs init docs/ontology
node cli/src/index.mjs validate docs/ontology
```

`validate` 会报告失效的引用、未知的类型和格式错误的身份。大多数发现都是不妨碍你继续工作的警告；重复的 `uid` 则是错误。其他命令见 [CLI](/guide/cli)。

## 文件就是事实

Atlas 每次都从文件中读取本体。无论是在你的编辑器里、通过 CLI 还是通过智能体编辑文件，地图都会在几秒钟内反映这个改动。没有同步按钮，也没有隐藏的状态。每一处改动，包括智能体做出的改动，都是 `git diff` 中的一行，你可以审查、保留或撤销。

下一步：[选择概念](/guide/what-becomes-a-node)。
