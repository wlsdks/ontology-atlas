# CLIとMCPの関係

この章では、Ontology Atlasのコマンドラインインターフェースについて説明します。実行方法、日常的に使うコマンド、そしてClaude CodeやCodexなどのコーディングエージェントが呼び出すMCPサーバと1つのエンジンを共有している仕組みです。CLIの操作はすべて、マップに表示されるのと同じMarkdownのオントロジーフォルダに対して行われます。

## ソースのチェックアウトから実行する

npmパッケージはないので、`npx`は使えません。CLIはリポジトリのクローンから実行し、Git、Node.js 24、pnpmが必要です。クローンは、記述したいリポジトリの外に置いてください。

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

`mcp`フォルダには独自のロックファイルがあるので、インストールの行は2つとも必要です。あとは、どのコマンドも`node`で実行します。

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

代わりに`atlas`と打てるようにしたい場合は、`install-shim`が、このクローンを指す1行のランチャーを`~/.local/bin/atlas`に書き込みます。書き込む前にランチャーの内容を表示し、`install-shim --uninstall`で削除できます。

エージェントを接続するだけならCLIは必要ありません。デスクトップアプリはMCPサーバのコピーを内蔵していて、エージェントの設定も書き込んでくれます（[MCPでコーディングエージェントを接続](/guide/connect-agent)を参照）。

## 1つのエンジン、3つの入口

| 入口 | 使う人 |
|---|---|
| アプリやWebサイトのマップ | 人 |
| MCPツール | コーディングエージェント |
| CLI | ターミナルを使う人とスクリプト |

`backlinks`、`blast-radius`、`rename`、`relate`などのグラフ系コマンドは、1回の呼び出しのためにMCPサーバを起動し、終わると停止します。そのため、ターミナルで実行したコマンドと、エージェントが呼び出した同じツールは、同じ答えを返し、同じ書き込みルールに従います。フォルダが大きくてこれらのコマンドがタイムアウトする場合は、`OATLAS_CLI_MCP_TIMEOUT_MS`で待ち時間を延ばしてください。

## 始めるためのコマンド

| やること | コマンド |
|---|---|
| スターターファイルとエージェントの設定を含むオントロジーフォルダを作る | `init ./atlas` |
| 既存のフォルダのエージェント設定を直す | `agent-setup ./atlas --write` |
| MCPサーバが起動して応答するか確かめる | `mcp-verify ./atlas` |
| リポジトリから概念の候補をプレビューする | `bootstrap . --vault ./atlas` |
| `CLAUDE.md`や`AGENTS.md`を概念に変える | `absorb CLAUDE.md --vault ./atlas` |
| 既存のMarkdownファイルを取り込む | `import <path...> --vault ./atlas` |

`bootstrap`、`analyze`、`index`、`infer-imports`はプレビューするだけです。概念は書き込まず、`bootstrap`はまだ承認が必要であることを示すために終了コード3で終わります。概念そのものは、[コードから最初のマップを作る](/guide/from-your-repo)で説明しているように、あなたがレビューするエージェントが作ります。

## 調べるためのコマンド

これらは読み取るだけなので、気軽に実行できます。

| 問い | コマンド |
|---|---|
| この概念は何で、何とつながっているか | `node <slug> ./atlas` |
| この概念を指しているものは何か | `backlinks <slug> --vault ./atlas` |
| これを変えると何に影響しうるか | `blast-radius <slug> --vault ./atlas` |
| この2つの概念はどうつながっているか | `path <from> <to> --vault ./atlas` |
| 似たものがすでにあるか | `similar "<title>" ./atlas` |
| 条件に合う概念はどれか | `query "kind=capability AND has(elements)" --vault ./atlas` |
| フォルダ全体はどうなっているか | `overview ./atlas` |
| 次に何を直すべきか | `maintenance ./atlas` |

## 書き込むコマンド

| やること | コマンド | デフォルト |
|---|---|---|
| 概念を追加する | `add <kind> <slug> --title "..." --vault ./atlas` | 書き込む |
| 関係を追加する | `relate <from> <to> <type> --why "..." --vault ./atlas` | 書き込む。`--dry-run`でプレビュー |
| 関係を削除する | `remove-relation <from> <to> <type>` | 書き込む。`--dry-run`でプレビュー |
| 概念とその参照の名前を変える | `rename <old> <new> --vault ./atlas` | プレビュー。`--confirm`で適用 |
| 2つの概念をマージする | `merge <from> <into> --vault ./atlas` | プレビュー。`--confirm`で適用 |
| 概念を削除する | `delete <slug> --vault ./atlas` | プレビュー。参照が残っている間は拒否 |

書き込む前には、対応する読み取りコマンドを実行してください。`relation-check`は`relate`の前に関係をスキーマに照らしてチェックし、`backlinks`は名前の変更や削除が何に触れるかを示します。

## チェックするためのコマンド

| 問い | コマンド |
|---|---|
| Markdownは正しく、参照は解決できるか | `validate ./atlas` |
| 参照しているソースファイルはまだあり、グラフは健全か | `health ./atlas` |
| どこからも指されていない概念はどれか | `orphans ./atlas` |
| 依存が循環していないか | `cycles ./atlas` |
| ステージしたファイルはどの概念に触れるか | `preflight ./atlas --staged` |

`validate`が読むのはオントロジーフォルダだけです。`health`は参照しているパスをコードとも比べるので、リファクタリングで根拠が削除された概念も見つけられます。`validate`はエラーを見つけると終了コード1で終わるので、CIに組み込めます。`preflight`がコミットをブロックすることはありません。

## エージェントと共有のためのコマンド

| やること | コマンド |
|---|---|
| 新しいエージェントのセッションに最初の文脈を渡す | `agent-brief ./atlas` |
| 状態と次にやることを1画面で見る | `workspace-brief ./atlas` |
| オントロジーフォルダだけを要約付きでコミットする | `snapshot ./atlas` |
| グラフをエクスポートする | `export ./atlas --format jsonld`（または`graphml`、`json`） |

`agent-brief`は、`init`の直後など、フォルダにまだ手当てが必要な間は終了コード1で終わります。それでも出力は完全です。`snapshot`はローカルでコミットするだけです。`--push`を付けるとブランチの既存のupstreamに送り、`--dry-run`を付けるとプレビューします。

ほぼすべてのコマンドが、スクリプト向けに`--json`を受け付けます。すべてのオプションを含む完全な一覧はヘルプにあります。

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

コードの変更に合わせて、これらのコマンドでマップを最新に保つ方法は、[コードの変更に合わせてマップを最新に保つ](/guide/growing-vault)を参照してください。
