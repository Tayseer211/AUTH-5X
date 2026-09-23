// A QR-looking pattern for illustrations only. It does not encode anything.

const SIZE = 25;

function isFinder(x: number, y: number) {
  const inBox = (ox: number, oy: number) =>
    x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
  return inBox(0, 0) || inBox(SIZE - 7, 0) || inBox(0, SIZE - 7);
}

function finderCell(x: number, y: number) {
  const lx = x >= SIZE - 7 ? x - (SIZE - 7) : x;
  const ly = y >= SIZE - 7 ? y - (SIZE - 7) : y;
  const ring = Math.min(lx, ly, 6 - lx, 6 - ly);
  return ring !== 1;
}

// Deterministic so server and client render the same pattern.
function buildPath(seed: number) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  let d = "";
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const filled = isFinder(x, y) ? finderCell(x, y) : random() > 0.52;
      if (filled) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

export function DecorativeQr({ seed = 7, className = "" }: { seed?: number; className?: string }) {
  return (
    <svg
      viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="-1" y="-1" width={SIZE + 2} height={SIZE + 2} fill="#fff" />
      <path d={buildPath(seed)} fill="currentColor" />
    </svg>
  );
}
