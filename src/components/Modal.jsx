import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'

// Native <dialog> modal: Escape and backdrop clicks both call onClose.
function Modal({ open, title, onClose, children, footer }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="fa-modal"
      aria-labelledby="fa-modal-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      {open && (
        <div className="fa-modal__panel">
          <header className="fa-modal__header">
            <h2 id="fa-modal-title">{title}</h2>
            <button type="button" className="fa-icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </header>
          <div className="fa-modal__body">{children}</div>
          {footer && <footer className="fa-modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export default Modal
