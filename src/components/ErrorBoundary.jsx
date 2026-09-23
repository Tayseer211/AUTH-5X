import { Component } from 'react'
import Logo from './Logo.jsx'
import Button from './Button.jsx'
import { storage } from '../storage/storage.js'

// Last-resort crash screen. "Clear saved data" only removes fraud.auth keys.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('fraud.auth crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="fa-crash">
        <Logo size={30} />
        <h1>Something went wrong</h1>
        <p>{this.state.error.message || 'The screen could not be displayed.'}</p>
        <div className="fa-inline-actions">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button
            variant="secondary"
            onClick={() => {
              storage.clearAll()
              window.location.hash = '/'
              window.location.reload()
            }}
          >
            Clear saved data and restart
          </Button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
