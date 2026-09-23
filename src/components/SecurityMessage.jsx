import { LockIcon } from './icons.jsx'
import './SecurityMessage.css'

// Subtle reassurance message shown near the login form.
// Intentionally avoids naming specific encryption standards/certifications.
function SecurityMessage() {
  return (
    <p className="security-message">
      <LockIcon className="security-message__icon" />
      <span>Your information is protected with secure encryption.</span>
    </p>
  )
}

export default SecurityMessage
