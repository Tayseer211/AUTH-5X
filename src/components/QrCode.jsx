import { useMemo } from 'react'
import { qrMatrix, qrSvg } from '../utils/qr.js'

// Draws `value` as a QR code: dark modules on a white square (including the
// quiet zone) in every theme, because scanners need the contrast. The code is
// derived from the value each time, so the same value always looks the same.
function QrCode({ value, size = 300, label = 'QR code' }) {
  const { size: modules, path } = useMemo(() => qrSvg(qrMatrix(value)), [value])
  return (
    <svg className="fa-qr" width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

export default QrCode
