import { useEffect, useState } from "react";

/**
 * 起動時のみ表示するスプラッシュ。
 * 日常のタイトルバー／メニューには触れず、起動演出に限定する。
 * モチーフ: 横綱のしめ縄（綱）の結びを簡略化したマーク + 「横綱」の筆致風表示。
 */
export function SplashScreen({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("hold"), 80);
    const t2 = window.setTimeout(() => setPhase("out"), 1100);
    const t3 = window.setTimeout(() => onDone?.(), 1550);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone]);

  return (
    <div
      className={`yo-splash yo-splash--${phase}`}
      role="status"
      aria-label="YOKOZUNA 起動中"
    >
      <div className="yo-splash-mark" aria-hidden>
        {/* しめ縄／まわしの結びを抽象化したシンボル */}
        <svg viewBox="0 0 64 64" width="72" height="72">
          <defs>
            <linearGradient id="yo-rope" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e8eef2" />
              <stop offset="55%" stopColor="#e05a3c" />
              <stop offset="100%" stopColor="#b8432a" />
            </linearGradient>
          </defs>
          {/* 円環（綱） */}
          <circle
            cx="32"
            cy="32"
            r="22"
            fill="none"
            stroke="url(#yo-rope)"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          {/* 結び目 */}
          <path
            d="M22 34c2-8 8-12 14-12s12 4 14 12c-4-2-8-3-14-3s-10 1-14 3z"
            fill="#e05a3c"
            opacity="0.95"
          />
          <path
            d="M28 36c1.5 4 4 7 4 10m4-10c-1.5 4-4 7-4 10"
            fill="none"
            stroke="#e8eef2"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* 四色房の点（東青・南朱・西白・北黒） */}
          <circle cx="32" cy="8" r="2.2" fill="#3d7eb8" />
          <circle cx="56" cy="32" r="2.2" fill="#e05a3c" />
          <circle cx="32" cy="56" r="2.2" fill="#e8eef2" />
          <circle cx="8" cy="32" r="2.2" fill="#1a1f23" stroke="#60727c" strokeWidth="0.6" />
        </svg>
      </div>
      <div className="yo-splash-title">横綱</div>
      <div className="yo-splash-sub">YOKOZUNA</div>
      <div className="yo-splash-hint">稽古中…</div>
    </div>
  );
}
