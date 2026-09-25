import { bankMark } from '../data/bankMarks.js'

// A bank's mark and name, chosen from its code: the bank's logo image when the
// project has one (data/bankMarks.js), otherwise a lettered tile.
function BankMark({ code }) {
  const { name, logo, letters } = bankMark(code)
  return (
    <span className="fa-bank-mark" data-bank={code}>
      {logo ? (
        <img className="fa-bank-mark__logo" src={logo} alt="" />
      ) : (
        <span className="fa-bank-mark__tile" aria-hidden="true">
          {letters}
        </span>
      )}
      <span className="fa-bank-mark__name">{name}</span>
    </span>
  )
}

export default BankMark
