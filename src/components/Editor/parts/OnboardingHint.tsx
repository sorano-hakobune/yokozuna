export function OnboardingHint({ onDismiss }: { onDismiss: (permanent: boolean) => void }) {
  return (
    <div className="onboarding-hint" role="dialog" aria-label="はじめての案内">
      <div className="onboarding-hint-inner">
        <h3>最初のアニメーションを作ってみましょう</h3>
        <ol>
          <li>左のツールを選択</li>
          <li>ステージをドラッグして描画</li>
          <li>タイムラインでキーフレームを追加（F6 またはダブルクリック）</li>
          <li>別フレームでオブジェクトを編集</li>
          <li>再生ボタンで確認</li>
        </ol>
        <div className="onboarding-hint-actions">
          <button type="button" onClick={() => onDismiss(false)}>
            閉じる
          </button>
          <button type="button" className="is-primary" onClick={() => onDismiss(true)}>
            今後表示しない
          </button>
        </div>
      </div>
    </div>
  );
}
