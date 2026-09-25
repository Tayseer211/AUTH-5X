import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { QR_QUIET_ZONE, qrMatrix, qrSvg } from './qr.js'

const PAYLOAD =
  '{"type":"fraud.auth.transaction","version":1,"reference":"FA-0123456789","date":"2026-09-24T14:32:00+04:00","amount":2500,"currency":"MUR","customer":"Tayseer","bank":"MCB","recipient":"ABC Services Ltd"}'

// A 7×7 finder pattern whose top-left module is at (row, col): a dark ring,
// a light ring, and a dark 3×3 centre.
function isFinder(matrix, row, col) {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3)) // 0 centre … 3 outer
      const expected = ring !== 2
      if (matrix[row + r][col + c] !== expected) return false
    }
  }
  return true
}

describe('qrMatrix', () => {
  const matrix = qrMatrix(PAYLOAD)

  test('is a square matrix of a valid QR size (4 × version + 17)', () => {
    const size = matrix.length
    assert.ok(size >= 21 && (size - 17) % 4 === 0, `size ${size}`)
    for (const row of matrix) {
      assert.equal(row.length, size)
      assert.ok(row.every((module) => typeof module === 'boolean'))
    }
  })

  test('has the three finder patterns and the timing pattern that scanners lock on to', () => {
    const size = matrix.length
    assert.ok(isFinder(matrix, 0, 0), 'top left')
    assert.ok(isFinder(matrix, 0, size - 7), 'top right')
    assert.ok(isFinder(matrix, size - 7, 0), 'bottom left')
    for (let i = 8; i < size - 8; i += 1) {
      assert.equal(matrix[6][i], i % 2 === 0, `row timing ${i}`)
      assert.equal(matrix[i][6], i % 2 === 0, `column timing ${i}`)
    }
  })

  test('is deterministic, and different text gives a different code', () => {
    assert.deepEqual(qrMatrix(PAYLOAD), matrix)
    assert.notDeepEqual(qrMatrix(PAYLOAD.replace('FA-0123456789', 'FA-0123456780')), matrix)
  })

  test('fits the receipt payload in a small code and grows for longer text', () => {
    assert.ok(matrix.length <= 65, `payload code is ${matrix.length} modules wide`)
    assert.ok(qrMatrix(PAYLOAD.repeat(4)).length > matrix.length)
  })

  test('refuses to encode nothing', () => {
    for (const bad of ['', null, undefined, 42]) assert.throws(() => qrMatrix(bad), /needs some text/)
  })
})

describe('qrSvg', () => {
  const matrix = qrMatrix(PAYLOAD)
  const { size, path } = qrSvg(matrix)

  test('adds the quiet zone around the code', () => {
    assert.equal(size, matrix.length + 2 * QR_QUIET_ZONE)
    assert.equal(qrSvg(matrix, 0).size, matrix.length)
  })

  test('draws exactly the dark modules, inside the quiet zone', () => {
    const runs = [...path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)]
    // Every character of the path belongs to a run.
    assert.equal(runs.map((run) => run[0]).join(''), path)
    const drawn = new Set()
    for (const [, x, y, length] of runs) {
      assert.ok(Number(x) >= QR_QUIET_ZONE && Number(x) + Number(length) <= matrix.length + QR_QUIET_ZONE)
      assert.ok(Number(y) >= QR_QUIET_ZONE && Number(y) < matrix.length + QR_QUIET_ZONE)
      for (let i = 0; i < Number(length); i += 1) drawn.add(`${Number(x) + i - QR_QUIET_ZONE},${Number(y) - QR_QUIET_ZONE}`)
    }
    const dark = new Set()
    matrix.forEach((row, y) => row.forEach((module, x) => module && dark.add(`${x},${y}`)))
    assert.deepEqual([...drawn].sort(), [...dark].sort())
  })

  test('is deterministic', () => {
    assert.deepEqual(qrSvg(qrMatrix(PAYLOAD)), { size, path })
  })
})
