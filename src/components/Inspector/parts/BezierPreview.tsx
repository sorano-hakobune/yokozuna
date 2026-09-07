import { cubicBezierAt } from "@/lib/animation/easing";

export function BezierPreview({
  bezier,
}: {
  bezier: [number, number, number, number];
}) {
  const w = 120;
  const h = 72;
  const pad = 6;
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = i / 24;
    const y = cubicBezierAt(bezier[0], bezier[1], bezier[2], bezier[3], x);
    const sx = pad + x * (w - pad * 2);
    const sy = h - pad - y * (h - pad * 2);
    pts.push(`${sx},${sy}`);
  }
  const [x1, y1, x2, y2] = bezier;
  const c1x = pad + x1 * (w - pad * 2);
  const c1y = h - pad - y1 * (h - pad * 2);
  const c2x = pad + x2 * (w - pad * 2);
  const c2y = h - pad - y2 * (h - pad * 2);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        display: "block",
        margin: "4px 0",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 4,
      }}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#e05a3c"
        strokeWidth={1.5}
      />
      <line x1={pad} y1={h - pad} x2={c1x} y2={c1y} stroke="#80929b" strokeWidth={1} />
      <line x1={w - pad} y1={pad} x2={c2x} y2={c2y} stroke="#80929b" strokeWidth={1} />
      <circle cx={c1x} cy={c1y} r={3} fill="#3d7eb8" />
      <circle cx={c2x} cy={c2y} r={3} fill="#3d7eb8" />
      <circle cx={pad} cy={h - pad} r={2.5} fill="#e8eef2" />
      <circle cx={w - pad} cy={pad} r={2.5} fill="#e8eef2" />
    </svg>
  );
}
