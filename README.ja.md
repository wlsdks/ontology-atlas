[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh.md)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark@2x.png" />
    <img src="public/brand/lockup-light@2x.png" alt="Ontology Atlas" width="360" />
  </picture>
</h1>

<p align="center"><strong>AI エージェントがコードを変えても、システムを理解し続けられます。</strong></p>

![Online Store プロジェクトを選んだ Ontology Atlas の macOS アプリ。そのプロジェクトのドメイン名が周囲に並び、無関係なものは薄くなり、インスペクターにプロジェクトの記録とコード根拠の状態が表示されている](docs/assets/readme/topology-overview.png)

<p align="center">
  <a href="https://ontologyatlas.com/en/download/"><strong>macOS 版をダウンロード</strong></a> ·
  <a href="https://ontologyatlas.com/en/download/">Windows x64 ベータ</a> <sub>未署名</sub> ·
  <a href="https://ontologyatlas.com/en/topology/">ブラウザで試す</a> ·
  <a href="https://ontologyatlas.com/en/guide/">ガイド</a>
</p>

<p align="center"><a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a> <a href="https://mcpservers.org/servers/wlsdks/ontology-atlas"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" height="20" /></a></p>

- **macOS**（Apple Silicon）版は署名と公証済みで、アプリ内に MCP サーバーを同梱しています。
- **Windows x64** は未署名のベータ版です。SmartScreen が警告を出すことがあり、管理下の PC では実行がブロックされる場合があります。
- **Linux** 向けのアプリはまだありません。ブラウザ版を使うか、[ソースのチェックアウト](cli/README.md#set-up-from-a-source-checkout)から CLI と MCP サーバーを実行してください。

各リリースのバージョン、サイズ、チェックサムは[ダウンロードページ](https://ontologyatlas.com/en/download/)にあり、[GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases) にも同じファイルがあります。以下からリンクしているサイトとリポジトリのドキュメントは英語です。

## できること

- **コーディングエージェントにタスクの文脈を渡します。** Claude Code、Codex、Cursor、Antigravity が MCP 経由で、タスクに関わる機能、コードパス、依存関係、根拠、未確認事項を読み取ります。
- **その意味を、自分で管理する Markdown に残します。** リポジトリ内の `atlas/` フォルダに、概念ごとに 1 ファイルが置かれます。履歴とレビューは Git が担います。
- **最終判断は人が行います。** 提案された変更は Markdown の diff として届き、そのまま残すことも、直すことも、却下することもできます。
- **人にも同じフォルダを見せます。** マップ、ドキュメント、ライブラリ、インサイト、Git 履歴は、すべてそれらのファイルを読んで表示します。
- **分からないことは分からないと示します。** マップ上の線は宣言された関係であり、実行時の影響を示す証拠ではありません。根拠がなければ「安全」ではなく「未確認」と表示されます。

**まだ証明できていないこと:** 再採点した結果、私たちのベンチマークでは Atlas を使った場合の回答品質の差を測定できておらず、Atlas のほうが遅くなりました（[訂正記録](docs/benchmark/FINDINGS-2026-08-31-metric-split.md)）。

## クイックスタート

1. **インストール**: [ダウンロードページ](https://ontologyatlas.com/en/download/)からアプリを入手するか、[ブラウザ版](https://ontologyatlas.com/en/topology/)を開きます。
2. **フォルダを開く**: Atlas はフォルダ内の Markdown をその場で読むか、リポジトリに `atlas/` フォルダを新しく作ります。何かを書き込む前に、必ずパスを表示します。
3. **エージェントを接続**: **Agents › MCP** で使っているツールの **Connect** を押し、エージェントを再起動して、次のタスクについて質問してみましょう。

## フォルダ構成

```text
your-repo/
├── src/
└── atlas/                 ← コードと一緒にクローン、ブランチ作成、レビューする
    ├── project.md
    ├── domains/  capabilities/  elements/
    ├── sources/           届いたままの形で保管したドキュメント
    └── wiki/              それらから書いたページ。すべての事実に出典つき
```

frontmatter に `kind:` を持つ Markdown ファイル 1 つが、概念 1 つです。`uid` は変わらず、`slug` は現在のアドレスで、`path` はその概念が説明するコードを指します。1 つのフォルダに置ける概念の数に上限はありません。

あわせて [What becomes a node?](docs/guide/what-becomes-a-node.md)、[Relations](docs/guide/relations.md)、[仕様](docs/ONTOLOGY-ATLAS-SPEC.md)もご覧ください。

## コーディングエージェントと使う

- **MCP**（Model Context Protocol）: エージェントが Atlas の MCP サーバーを起動し、そのサーバーがディスク上のフォルダを直接読み書きします。アプリを閉じていても動きます。[エージェントを接続する](docs/guide/connect-agent.md) · [MCP リファレンス](mcp/README.md)
- **ACP**（Agent Client Protocol）: Claude Agent と Codex は、アプリ内のチャットでも動かせます。読み取りはそのまま通り、Atlas への書き込みは毎回 1 度許可するまで待機します。[Agents 画面](docs/features/agents.md)

## 構築の測定結果

2026-10-03、未読の MIT Python 設定ライブラリを実際の ACP セッションで構築し、ソースを読めない別セッションとソース監査で評価しました。単一リポジトリの限定的な結果であり、モデル順位や意味品質の認定ではありません。

| 経路 | 測定結果 | 意味に関する根拠 |
|---|---|---|
| Claude Sonnet 5.5、low · full → construction | 107.6 → 100.4秒、ツール説明・入力スキーマ24.0%削減 | 完全回答3/6 → 2/6、検証済み主張17/18 → 18/21、両方とも要レビュー |
| Codex Luna low · 初回ACP診断 | 250.2秒、3ノード、33呼び出し中4失敗 | 完全回答1/6、主張13/13検証、説明範囲は不足 |
| Codex Luna xhigh · full / construction | 両方900秒で終了、4 / 2ノード、完了レシートなし | 構築未完了 |
| ローカル27B · 空の保管庫ループ修正前 → 後 | モデル要求4 → 2回、189.1 → 151.6秒 | ソース用ツールの不足を説明、作成ノード0 |

任意の `OATLAS_TOOL_PROFILE=construction` は初回構築用の既存20ツールを公開し、既定の `full` は40ツールを維持します。この比較では、入力の縮小は引き継ぎ品質を改善しませんでした。ローカルのソースMCP実験も保存前に失敗したため、コードからの構築品質は未測定です。内部ローカル会話とACP構築はツール能力が異なります。ローカルループはNode HTTP接続で測定し、インストール済みアプリのネイティブ接続は未検証です。

`pnpm benchmark:construction <runs.json> [--json]` は時間、使用量、ツールエラー、グラフ・パス検査、ソース非公開回答、主張監査を分けて記録します。[手順・失敗・限界](docs/benchmark/CONSTRUCTION.md) · [プロファイル設定](mcp/README.md#first-construction-discovery-oatlas_tool_profile)


本文根拠の改善試験では、既知の設定ライブラリで完全回答が **2/6→4/6**、検証済み主張が **19/20** となりました。新しい再試行ライブラリは4/6に回答しましたが、21主張中16件のみ検証、4件は誤り、1件は未確認です。同じソース根拠の後続応答は **11,105→2,042バイト（81.6%削減）**。設定ライブラリの構築は137.5秒で、全体速度の改善ではありません。一般的な意味品質、正式認定、ネイティブのローカル構築は未証明です。[本文根拠の試験](docs/benchmark/CONSTRUCTION.md#body-evidence-improvement-trial)

承認したモデルの提案の適用に失敗すると、保存完了を確認したファイルを表示し、フォルダーの再読み込みを試みます。再読み込みのエラーは別に報告します。失敗した保存自体も内容を変更した可能性があり、自動的には元に戻しません。再試行する前に文書を確認してください。

## ローカルファーストとプライバシー

- Atlas にはバックエンド、アカウント、テレメトリがありません。フォルダは、普通の Markdown としてあなたのディスクに残ります。
- 自分の API key やローカルモデルで Atlas がモデルを呼び出す機能はオプトインで、呼び出しごとに宛先が `.ontology-atlas/llm-audit.jsonl` に記録されます。
- 接続したコーディングエージェントは、プロンプトと読み取った文脈を自身のプロバイダーに送信することがあります。その送信はこのログの対象外です。

[信頼について](docs/guide/trust.md) · [セキュリティ](SECURITY.md)

## CLI

CLI はソースのチェックアウトから、Node.js 24 で `node cli/src/index.mjs` として実行します。npm パッケージはありません。フォルダの作成、検証、コンパイル、クエリができ、`mcp-verify` でエージェントとの接続が生きていることを確認できます。[CLI リファレンス](cli/README.md)

## 開発

まず [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。外部からのプルリクエストはフォークから送ります。人とエージェントが共通で従うルールは [AGENTS.md](AGENTS.md) にあります。
`pnpm install` と `pnpm dev` で始め、`pnpm checks:changed -- --run` で変更を検査し、`pnpm pr:land <number>` で取り込みます。
リポジトリのコマンド一覧は英語版 README の [Development](README.md#development) にあり、検査の全体は [Development checks](docs/DEVELOPMENT-CHECKS.md) にまとまっています。

## ライセンス

[MIT](LICENSE)。サードパーティの告知は [NOTICE.md](NOTICE.md)、ライセンス全文は [public/third-party-licenses.txt](public/third-party-licenses.txt) にあります。
