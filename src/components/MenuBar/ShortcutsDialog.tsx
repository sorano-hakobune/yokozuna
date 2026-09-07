export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="shortcuts-modal" role="dialog">
      <div className="shortcuts-modal-inner">
        <h3>キーボードショートカット</h3>
        <ul>
          <li><kbd>F5</kbd> フレームを挿入</li>
          <li><kbd>F6</kbd> キーフレームを挿入</li>
          <li><kbd>Shift+F5</kbd> フレームを削除</li>
          <li><kbd>Shift+F6</kbd> キーフレームを削除</li>
          <li><kbd>F8</kbd> シンボルに変換</li>
          <li><kbd>F2</kbd> レイヤー名を変更</li>
          <li><kbd>O</kbd> オニオンスキン</li>
          <li><kbd>Ctrl+Z</kbd> 元に戻す</li>
          <li><kbd>Ctrl+Shift+Z</kbd> やり直す</li>
          <li><kbd>Space</kbd> 再生 / 一時停止</li>
        </ul>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
