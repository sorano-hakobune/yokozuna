# Yokozuna（横綱）

**Flash / Adobe Animate の思想を受け継いだ、軽量なクロスプラットフォーム 2D アニメーション編集ツール**

Yokozuna は、タイムラインベースの 2D アニメーションをブラウザとデスクトップの両方で快適に作成できるモダンなオーサリングツールです。  
Adobe Animate（旧 Flash Professional）のワークフローにインスパイアされつつ、現代的な UI / アーキテクチャで再設計しています。

- **ランタイム**: Tauri 2（軽量・高速・配布しやすい）
- **フロントエンド**: React + TypeScript + Vite
- **キャンバス**: SVG ベースのステージ（高精度な変形・エクスポート対応）
- **状態管理**: Zustand
- **プロジェクト形式**: `.yoko`（JSON ベース）

[English](README.en.md)

---

## 特徴

### アニメーションコア

- **キーフレーム方式** — 1つのキーフレームに複数プロパティを保持（Flash スタイル）
- **モーショントゥイーン** — イージング付きの位置・スケール・回転・透明度補間
- **シェイプトゥイーン** — 輪郭リサンプルによる形状モーフィング
- **カスタムイージング** — 30種類以上の Penner カーブ + 任意の Cubic Bézier
- **モーションパス** — パスに沿った移動 + 向きの自動追従
- **オニオンスキン** — 前後フレームのゴースト表示
- **フレームラベル** — マーカー付きのタイムライン管理

### 描画・編集

- 矩形 / 円 / 線 / パス / テキスト
- ベジェ曲線編集（ハンドル操作・スムーズ化 / 直線化）
- パス頂点の追加・削除・移動
- ペイントバケツ + スポイト
- グラデーション塗り（線形・放射）
- ピボット（変形原点）の自由設定
- マルチセレクト + グループ変形
- 整列・分布ツール

### レイヤー・シンボル

- 通常 / ガイド / マスクレイヤー
- レイヤーフォルダ（入れ子・折りたたみ）
- シンボル作成・配置・編集モード（F8 / ダブルクリック）
- レイヤーのロック / 表示切替 / 並べ替え

### アセット・音声

- SVG / 画像のインポート（ベクター優先 / ビットマップ）
- 音声トラック（MP3 / WAV など）のタイムライン配置
- ライブラリ管理（ソート・グリッド・複製・使用状況）

### 書き出し

- PNG シーケンス（透明対応） + ZIP パッケージ
- WebM 動画（音声ミックス対応）
- プロジェクト保存（`.yoko` / レガシー `.json`）

### UX

- 日本語 UI（メニュー・インスペクタ・再生コントロール）
- アンドゥ / リドゥ（スナップショット履歴）
- オートセーブ + 最近使ったファイル
- グリッド / スナップ / ガイド
- ショートカット多数（Flash 互換を意識）

---

## 開発環境のセットアップ

### 必要要件

- Node.js 20+
- pnpm（推奨）または npm / yarn
- Rust（Tauri 2 用）
- 対応 OS: Windows / macOS / Linux

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/sorano-hakobune/yokozuna.git
cd yokozuna

# 依存関係をインストール
pnpm install

# 開発サーバー起動（Web）
pnpm dev

# Tauri デスクトップアプリとして起動
pnpm tauri dev
```

### ビルド

```bash
# Web ビルド
pnpm build

# デスクトップアプリ配布用ビルド
pnpm tauri build
```

---

## プロジェクト構造（概要）

```text
src/
├── types/               # Project / Layer / Keyframe / Symbol などの型定義
├── lib/
│   ├── project/         # createEmptyProject, generateId, fileIo など
│   ├── easing.ts        # イージング関数群
│   ├── transformGeometry.ts
│   └── ...
├── stores/
│   └── projectStore.ts  # Zustand メインストア + セレクター
├── components/
│   ├── Editor/          # メインエディタシェル
│   ├── Stage/           # キャンバス・変形ハンドル・描画ツール
│   ├── Timeline/        # タイムライン UI
│   ├── Inspector/       # 右ドック（カラー / ライブラリ / プロパティ）
│   ├── MenuBar/
│   ├── ToolsPanel/
│   └── Playback/
└── hooks/               # 再生同期・オートセーブなど
```

---

## プロジェクトデータモデル（抜粋）

```ts
interface Project {
  version: string;
  meta: { name: string; createdAt: string; updatedAt: string };
  settings: ProjectSettings;
  compositions: Composition[];
  symbols: Symbol[];
  assets: Asset[];
  activeCompositionId: string;
}

interface Keyframe {
  id: string;
  frame: number;
  elements: Element[]; // このキーフレーム上のオブジェクト
  tween?: TweenType; // motion | shape | none
  easing?: EasingType;
  easingBezier?: [number, number, number, number];
  motionPath?: PathPoint[];
}
```

詳細は `src/types/project.ts` を参照してください。

---

## ショートカット（一部）

| キー                            | 動作                       |
| ------------------------------- | -------------------------- |
| `Space` / `Enter`               | 再生 / 停止                |
| `Shift + L`                     | ループ再生切替             |
| `O`                             | オニオンスキン             |
| `F5`                            | フレーム挿入               |
| `F6`                            | キーフレーム挿入           |
| `F8`                            | シンボルに変換             |
| `Ctrl + Z` / `Ctrl + Shift + Z` | アンドゥ / リドゥ          |
| `Ctrl + C / X / V`              | コピー / カット / ペースト |
| `G`                             | グリッド表示切替           |
| `T`                             | テキストツール             |
| `K` / `I`                       | ペイントバケツ / スポイト  |

---

## ロードマップ（予定）

- [ ] ボーン / スキニング
- [ ] パーティクル
- [ ] スクリプトパネル（簡易 ActionScript 互換 / JS）
- [ ] クラウド同期・共同編集
- [ ] プラグインシステム
- [ ] 多言語対応の強化

---

## 貢献

Issue や Pull Request を歓迎します。  
大きな変更を行う前に、まずは Issue で方針を相談してもらえると助かります。

---

## ライセンス

[GPL-3.0](LICENSE)

---

## 謝辞

- Adobe Animate / Flash Professional の長年のデザイン思想
- Tauri / React / Zustand / Vite などのオープンソースプロジェクト

---

**Yokozuna** — 土俵の上で、アニメーションを全力で。
