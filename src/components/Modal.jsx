import { useEffect, useRef } from 'react'
import { XIcon } from './icons.jsx'
import './Modal.css'

// Thin wrapper around the native <dialog> element so callers just toggle
// `open` and don't need to think about showModal()/close() or the backdrop.
function Modal({ open, title, onClose, children, footer }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal__panel">
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </dialog>
  )
}

export default Modal
