import { Component, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: unknown): void {
    console.error('Application render error:', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '2.5rem',
            color: '#0f172a',
            background: '#f8fafc',
            minHeight: '100vh',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              background: '#ffffff',
              padding: '2rem',
              borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              border: '1px solid #e2e8f0',
            }}
          >
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.75rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              The application encountered an unexpected error while loading.
            </p>
            <pre
              style={{
                background: '#f1f5f9',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.85rem',
                color: '#b91c1c',
                border: '1px solid #e2e8f0',
                marginBottom: '1.5rem',
              }}
            >
              {this.state.error?.message || 'Unknown render error'}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.65rem 1.4rem',
                background: '#5b4cf0',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

