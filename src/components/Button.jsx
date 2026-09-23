import Icon from './Icon.jsx'

// Shared button. Renders an <a> when given `href` (hash links), otherwise a
// <button>. `loading` shows a spinner and disables the button.
function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  block = false,
  loading = false,
  disabled = false,
  icon,
  href,
  className = '',
  ...props
}) {
  const classes = ['fa-btn', `fa-btn--${variant}`, `fa-btn--${size}`, block ? 'fa-btn--block' : '', className].join(' ')
  const content = (
    <>
      {loading ? <span className="fa-btn__spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={17} />}
      <span>{children}</span>
    </>
  )

  if (href) {
    return (
      <a className={classes} href={href} {...props}>
        {content}
      </a>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  )
}

export default Button
