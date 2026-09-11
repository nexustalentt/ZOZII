import { useState } from 'react'
import type { ReactNode } from 'react'
import { parseMarkdown, renderInline } from '../lib/markdown'

export interface Exchange {
  id: number
  question: string
  answer: string
  done: boolean
}

function CopyButton({ value }: { value: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button type="button" className="code-copy" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function renderBlocks(source: string): ReactNode[] {
  return parseMarkdown(source).map((block, index) => {
    switch (block.type) {
      case 'heading': {
        const Tag = (block.level === 1 ? 'h3' : 'h4') as 'h3' | 'h4'
        return <Tag key={index}>{renderInline(block.lines[0])}</Tag>
      }
      case 'bullet-list':
        return (
          <ul key={index}>
            {block.items?.map((item, itemIndex) => (
              <li key={itemIndex}>
                {renderInline(item.text)}
                {item.children.length > 0 && (
                  <ul>
                    {item.children.map((child, childIndex) => (
                      <li key={childIndex}>{renderInline(child)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )
      case 'ordered-list':
        return (
          <ol key={index} start={block.start}>
            {block.items?.map((item, itemIndex) => (
              <li key={itemIndex}>
                {renderInline(item.text)}
                {item.children.length > 0 && (
                  <ul>
                    {item.children.map((child, childIndex) => (
                      <li key={childIndex}>{renderInline(child)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )
      case 'table':
        return (
          <div key={index} className="table-wrap">
            <table>
              <thead>
                <tr>
                  {block.header?.map((cell, cellIndex) => (
                    <th key={cellIndex}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows?.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'code':
        return (
          <div key={index} className="code-block">
            <div className="code-block-bar">
              <span>{block.language || 'code'}</span>
              <CopyButton value={block.lines.join('\n')} />
            </div>
            <pre>
              <code>{block.lines.join('\n')}</code>
            </pre>
          </div>
        )
      default:
        return <p key={index}>{renderInline(block.lines.join(' '))}</p>
    }
  })
}

function QuestionIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6.2 6.2c.2-1 .9-1.6 1.9-1.6 1 0 1.8.7 1.8 1.6 0 1.2-1.6 1.4-1.6 2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8.2" cy="11.1" r="0.9" fill="currentColor" />
    </svg>
  )
}

function AnswerIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 1.6L10.9 7.1L16.4 9L10.9 10.9L9 16.4L7.1 10.9L1.6 9L7.1 7.1L9 1.6Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function EmptyState(): React.JSX.Element {
  return (
    <div className="empty-state">
      <p className="empty-subtitle">No activity. Start recording or type a question.</p>
    </div>
  )
}

function ThinkingIndicator(): React.JSX.Element {
  return (
    <div className="thinking" aria-label="Thinking">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-text">Thinking...</span>
    </div>
  )
}

function AnswerActions({ answer }: { answer: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(answer)
    } catch {
      const area = document.createElement('textarea')
      area.value = answer
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="answer-actions">
      <button type="button" className="action-button" onClick={() => void copy()}>
        {copied ? 'Copied ✓' : 'Copy Answer'}
      </button>
    </div>
  )
}

export default function ResponsePanel({ exchanges }: { exchanges: Exchange[] }): React.JSX.Element {
  if (exchanges.length === 0) return <EmptyState />

  return (
    <div className="response-list">
      {exchanges.map((exchange) => (
        <article className="exchange" key={exchange.id}>
          <section className="exchange-question">
            <p className="exchange-label">
              <QuestionIcon />
              Question detected
            </p>
            <p className="exchange-question-text">{exchange.question}</p>
          </section>
          <section className="exchange-answer">
            <p className="exchange-label exchange-label--answer">
              <AnswerIcon />
              Answer
            </p>
            {exchange.answer.length === 0 && !exchange.done ? (
              <ThinkingIndicator />
            ) : (
              <div className="markdown">{renderBlocks(exchange.answer)}</div>
            )}
            {exchange.done && <AnswerActions answer={exchange.answer} />}
          </section>
        </article>
      ))}
    </div>
  )
}
