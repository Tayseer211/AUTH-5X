import qrcode from 'qrcode-generator'

// QR encoding for the transaction receipt. The encoding itself (version
// choice, error correction, masking) is done by the small `qrcode-generator`
// library; this module turns its result into plain data that a component can
// draw: a square matrix of dark/light modules and an SVG path for it.
//
// Pure and deterministic: the same text always gives the same matrix.

// Blank border around the code, in modules, as the QR standard requires.
export const QR_QUIET_ZONE = 4

// Error correction "M" recovers about 15% of damaged modules, a good balance
// for a short payload shown on a screen or a printout.
const ERROR_CORRECTION = 'M'

// The module matrix for `text`: matrix[row][col] is true for a dark module.
// The library picks the smallest QR version that fits the text.
export function qrMatrix(text) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('A QR code needs some text to encode')
  const qr = qrcode(0, ERROR_CORRECTION)
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)))
}

// An SVG description of a matrix: the side of the drawing in modules
// (including the quiet zone) and one path with a rectangle for every run of
// dark modules. Draw it with viewBox="0 0 size size" and a dark fill on a
// light background.
export function qrSvg(matrix, quietZone = QR_QUIET_ZONE) {
  const runs = []
  matrix.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x += 1
        continue
      }
      let end = x
      while (end < row.length && row[end]) end += 1
      runs.push(`M${x + quietZone} ${y + quietZone}h${end - x}v1h-${end - x}z`)
      x = end
    }
  })
  return { size: matrix.length + 2 * quietZone, path: runs.join('') }
}
