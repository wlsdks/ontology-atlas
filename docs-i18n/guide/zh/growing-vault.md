# 在代码变化时让地图保持最新

你和编码智能体不断修改代码时，代码库本体也要跟着如实更新。本章介绍：改动之后同步地图、安全地重命名、避免重复的概念、找出依据已经过时的概念，以及审查并提交改动。

## 代码改动之后同步

改动完成后，让做出改动的那个智能体在同一个会话里更新地图。判断标准如下：

- **同步**：改动新增、删除或重命名了领域、能力、元素，或者它们之间的关系。
- **跳过**：错别字、注释、单行的风格调整、lint 设置，以及不改变任何含义的测试数据。

智能体先用 `get_concept` 读取受影响的概念，再用 `patch_concept`、`add_concepts` 或 `add_relations` 修改它们，然后运行 `validate_vault`。代码重命名不一定要重命名概念。先判断是含义变了，还是只有文件变了；如果只是文件挪了位置，更新概念的 `path` 即可。

`init` 会为 Claude Code 和 Codex 安装三个起步技能。`atlas-review` 报告哪些地方失效或断开了，`atlas-grow` 提议下一步该添加什么，`atlas-absorb` 从笔记或规格说明中提取概念。在你选定要保留的内容之前，它们都不会写入任何东西。

## 查看哪些内容过时了

在桌面应用中，地图会标出依据可能已经过时的概念。如果概念引用的某个文件，在概念自身的文档最后一次修改之后又有了新的提交，这个概念就是 **过时** 的。每种地图视图都会用琥珀色或金色标出过时的概念，并在图例中注明这个标记。这需要文件夹的 Git 历史，所以浏览器版和没有 Git 的文件夹不会显示过时标记。

在终端里，`health` 会运行全套检查，包括概念所引用的源码路径是否仍然存在：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs health ./atlas
```

`validate` 只检查 Markdown 及其引用，不检查代码。如果一次重构删掉了被引用的文件，`validate` 可能照样通过，`health` 却会失败。

应用中的 **变更** 界面会读取你所选代码仓库的 Git 历史。它汇总一段时间内合并的内容，并为每项改动列出 **受影响的概念**，也就是代码路径被这项改动碰到的概念。忙完一周之后，适合来这里看看。

提交之前，`preflight --staged` 会把你暂存的文件与引用它们的概念对应起来，并打印它们会影响什么。它从不阻止提交；没有匹配的概念时，它什么也不打印。

## 避免重复

地图退化最常见的方式，是同一个概念用两个名字写了两遍。添加之前先检查：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs similar "order acceptance" ./atlas
```

如果得分很高，就去更新已有的概念。智能体也有同样的保护：如果已经存在标题相似的概念，`add_concept` 会返回警告。如果同一个概念已经存在两份，就把它们合并。合并会把所有引用都转到保留下来的那个概念上：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs merge capabilities/checkout capabilities/order-acceptance --vault ./atlas
```

## 重命名而不破坏引用

手动重命名概念容易漏掉引用。`rename` 会移动文件，并改写所有指向它的概念，包括 `relation_notes` 里的理由：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs backlinks capabilities/checkout --vault ./atlas
node ~/tools/ontology-atlas/cli/src/index.mjs rename capabilities/checkout capabilities/order-acceptance --vault ./atlas
```

slug 会改变，但概念的 `uid` 保持不变，所以智能体和导出结果仍然能认出它。`rename`、`merge` 和 `delete` 默认只做预览，加上 `--confirm` 才会执行。只要还有其他概念指向要删除的概念，`delete` 就会拒绝执行。智能体使用对应的 MCP 工具 `rename_concept`、`merge_concepts` 和 `delete_concept`，它们同样会先预览。

## 在地图上查看审阅结果

在应用中，选中一个概念并打开 **本体审阅**（在 **更多操作** 里）。**请 AI 审阅** 会让智能体检查地图，结果显示在 **审阅结果** 下，每个发现占一行，地图上也会标出这些发现涉及的概念。对每个发现，你可以选择 **让它修正**、**稍后再看** 或 **忽略**。这些发现只是智能体的推测。审阅本身从不修改地图。

## 同时编辑

你、你的同事和智能体可能会编辑同一个文件。Atlas 的写入从不会悄悄覆盖：

- 如果智能体传入了读取时得到的 `expected_mtime`，而文件此后又变过，MCP 写入工具就拒绝覆盖，智能体必须重新读取再试；不传则照常写入。
- 如果应用要把一项改动提议应用到一份刚刚改过的文档上，它不会写入任何内容，并会提示你。

## 提交改动

本体文件夹在 Git 里就是普通文件，所以你可以在同一个 pull request 中，把概念的改动和代码一起审查。在应用中，**Git** 界面按文档列出尚未提交的改动并标出改动的行，显示改动数量的 **提交** 按钮会把它们记录下来。你也可以在那里把某个文档恢复到更早的版本。在终端里，`snapshot` 只提交本体文件夹，并附上一份改动摘要：

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs snapshot ./atlas --dry-run
```

这里用到的所有命令都列在 [CLI 一章](/guide/cli) 中。概念和关系的具体形式，请看 [概念之间的关系](/guide/relations)。
