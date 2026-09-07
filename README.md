# Animation Editor (Working Title)

クロスプラットフォームなタイムラインベースの2Dアニメーション編集ツール。

- **フレームワーク**: Tauri 2（軽量・配布しやすい）
- **フロントエンド**: React + TypeScript + Vite
- **キャンバス**: Konva（予定）
- **状態管理**: Zustand
- **参考**: Adobe Animate / 旧 Suzuka（Flash作成ツール）の思想

## 現在の進捗

### 完了しているもの

- [x] プロジェクトデータ構造（JSONスキーマ）
- [x] TypeScript 型定義（`src/types/project.ts`）
- [x] 空プロジェクト生成（`createEmptyProject`）
- [x] Zustand ストア（レイヤー / キーフレーム / コンポジション操作）
- [x] よく使うセレクター
- [x] タイムラインUIの基本骨格（DOMベース）

### これから

- [ ] Tauri プロジェクトの正式な初期化
- [ ] Konva キャンバスとの連携
- [ ] キーフレームのドラッグ移動を本格実装
- [ ] シンボル編集
- [ ] 保存 / 読み込み（ローカルファイル）
- [ ] 書き出し（画像シーケンス / WebM など）

## フォルダ構成

```text
src/
├── types/
│   └── project.ts              # すべての型定義
├── lib/
│   └── project/
│       ├── generateId.ts
│       ├── createEmptyProject.ts
│       └── index.ts
├── stores/
│   ├── projectStore.ts         # Zustand メインストア
│   └── projectSelectors.ts     # セレクター
└── components/
    └── Timeline/
        ├── Timeline.tsx
        ├── TimelineRuler.tsx
        ├── TimelinePlayhead.tsx
        ├── LayerRow.tsx
        ├── KeyframeMarker.tsx
        ├── timeline.css
        └── index.ts
```

## 設計の要点

- **キーフレーム方式**: Flash寄り（1つのキーフレームに複数プロパティをまとめる）
- **シンボル**: 最初から対応する構造
- **時間単位**: すべてフレーム数で統一
- **イミュータブル更新**: Zustand の更新はすべて新しいオブジェクトを返す

## 使い方（開発時）

```bash
# 依存関係（例）
pnpm add zustand konva react-konva
pnpm add -D @types/node

# パスエイリアス @ → src を tsconfig / vite.config で設定すること
```

```ts
import { createEmptyProject } from "@/lib/project";
import { useProjectStore } from "@/stores/projectStore";
import { Timeline } from "@/components/Timeline";
```

## ライセンス

未定（開発中）
