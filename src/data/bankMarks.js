import { getBank } from './banks.js'

// How a bank is drawn on the QR receipt. The receipt carries only the bank's
// code (MCB, SBM, MAUBANK); the screen looks the picture up here.
//
// The project has no bank logo files, so `logo` is null and the receipt shows a
// lettered tile with the bank's name. To use real logos, put each image under
// public/ and set its path here, e.g. MCB: { logo: '/banks/mcb.svg' }. Nothing
// else changes, and the QR payload is unaffected.
export const BANK_LOGOS = {
  MCB: null,
  SBM: null,
  MAUBANK: null,
}

// The name, logo path (or null) and tile letters for a bank code. Codes the
// app does not know still get a tile, labelled with the code itself.
export function bankMark(code) {
  const name = getBank(code)?.name ?? String(code)
  return { code, name, logo: BANK_LOGOS[code] ?? null, letters: name.slice(0, 3).toUpperCase() }
}
