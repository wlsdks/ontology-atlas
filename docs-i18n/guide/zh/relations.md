# 概念之间的关系

关系是本体知识图谱中带类型的边：“这项能力依赖那项能力”“这个元素属于那项能力”。在 Atlas 中，每条关系都是某个概念 frontmatter 里的一个条目。本章列出各种关系类型，演示如何编写它们，并说明地图和编码智能体调用的 MCP 工具（例如 `find_path` 和 `find_backlinks`）怎样读取它们。

## 结构与含义

关系分为两组。

- **结构** 说明什么包含什么：项目包含领域，领域包含能力，能力包含元素。只有结构的话，只能构成一棵树。
- **含义** 说明概念之间如何相互依赖或相互关联，可以跨越任何层级。一个领域中的能力可以依赖另一个领域中的能力，两个领域之间也可以直接相关。只要有一条这样的关系，树就变成了图。

## 关系类型

| 含义 | frontmatter 键 | 从 → 到 | 在地图上 |
|---|---|---|---|
| 项目的领域 | `domains: [...]` | 项目 → 领域 | 环绕项目的领域 |
| 包含的能力 | `capabilities: [...]` | 项目或领域 → 能力 | 环绕领域的圆盘 |
| 包含的元素 | `elements: [...]` | 项目、领域或能力 → 元素 | 环绕能力的小点 |
| 所属领域 | `domain: <slug>` | 能力或元素 → 领域 | 把它放进该领域 |
| 通用包含 | `contains: [...]` | 任意概念 → 任意概念，在上面的键都不适用时使用 | |
| 依赖 | `dependencies: [...]` | 任意概念 → 它所需要的概念 | 一条指向被需要一方的渐细线 |
| 相关 | `relates: [...]` | 任意概念 ↔ 任意概念 | 一条点状细线 |
| 上位概念 | `broader: [...]` | 领域 → 领域，能力 → 能力，元素 → 元素 | 一条双细线，显示为 `is_a` |
| 描述 | `describes: [...]` | 文档 → 它所解释的概念 | 列在文档的面板中 |

读取时也接受 `depends_on:` 作为 `dependencies:` 的另一种写法；写入时统一输出 `dependencies:`。包含方向和推断规则的完整表格，见 [Atlas 规范第 5 节](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#5-relation-types-and-their-semantics)。

只有在两个同类型概念之间确实存在“是一种”的关系时，才使用 `broader`：凡是符合较窄定义的，也必须符合较宽的定义。同属一个领域、名称相似或文件夹嵌套，都不足以构成这种关系。

## 编写关系

一条关系只在源概念上写一次。目标概念不需要提到它。

```markdown
---
uid: 94cf0cde-1e74-497d-ac41-00cdf3a42f0b
slug: capabilities/vault-live-updates
kind: capability
title: Vault live updates
domain: domains/local-vault
dependencies: [capabilities/map-render]
relates: [capabilities/conflict-guard]
relation_notes: { capabilities/map-render: "检测到的文件改动必须重绘地图才能被看到。" }
---
```

`relation_notes` 为每条关系保存一句话，说明它为什么成立，以目标的 slug 为键。通过 MCP 服务器或地图编辑器新写入的 `depends_on` 必须带上这句话；其他关系只要你知道理由，也应当写上。概念面板会把没有理由的关系标为 **无理由**。

值都是 slug，所以人在文件里就能读懂这张图。只要不产生歧义，也可以用简写，例如用 `map-render` 代替 `capabilities/map-render`。通过 Atlas 重命名概念时，Atlas 会改写所有指向它的关系。

Atlas 写入关系列表时，会去掉多余空白、去重并排序，所以顺序没有任何含义。Atlas 从不自行添加反向关系或传递关系：写在一侧的 `relates` 不会复制到另一侧；A 依赖 B、B 依赖 C，Atlas 也不会写出“A 依赖 C”。缺少某条关系意味着“没有记录”，而不是“没有关系”。

## 地图如何使用关系

- 静止时，领域之间淡淡的弧线按方向表示两个领域的概念之间有多少条 `depends_on` 关系。
- 当你指向或选中一个概念时，地图只画出该概念自身声明的关系，另一端的每个概念各一条线：**依赖** 和 **被依赖** 用渐细线，**相关** 用点状线，**上位概念** 用双线。
- 概念面板中的 **依赖** 和 **被依赖** 只根据 `depends_on` 列出。相关和上位关系计入 **其他关系**。

完整的线条图例见 [读懂地图](/guide/reading-the-map)。

## 智能体如何使用关系

MCP 服务器根据同一批 frontmatter 回答关于图的问题，所以你的智能体不必逐个读取文件：

- `find_backlinks` 列出通过任意关系键或正文中的链接指向某个 slug 的所有概念。在重命名或删除之前调用它。
- `find_path` 返回两个概念之间的最短路径。每一跳都会注明连接它的键（`via`），如果记录了理由，还会给出理由（`rationale`）。
- `find_neighbors` 返回一个概念周围一跳范围内的概念，可按方向和类型过滤。
- `query_ontology` 配合 `impact` 或 `blast_radius`，回答“如果这里变了，会影响什么？”。它只沿着声明过的 `depends_on` 关系查找；结构关系不算影响。
- `query_ontology` 配合 `domain_matrix`，统计领域之间的关系数量。限定为 `depends_on` 时，得出的数字与地图上弧线所画的相同。

写入时，`add_relation` 接收 `from`、`to`、一个 `type`（`depends_on`、`relates`、`contains`、`describes`、`domains`、`capabilities`、`elements` 或 `domain`）以及一个 `why`。`remove_relation` 和 `replace_relation` 默认只做预览，只有带上 `confirm: true` 时才会写入。`broader` 目前还不是 `add_relation` 支持的类型：智能体需要用 `patch_concept` 修改它，传入完整的新列表和文件的 `mtime`，然后运行 `validate_vault`。

在地图上，**编辑关系** 每次写入一条关系，执行的检查与 MCP 工具相同；见 [编辑概念和关系](/guide/studio)。

## 文件始终是事实

添加一条关系，就是改动某个文件里的一行，它和其他改动一样会出现在 `git diff` 中。智能体写的关系和你写的看起来完全一样，所以审查一次就能把两者都看到。
