import type { ReactNode } from 'react'

// Minimal, dependency-free markdown renderer for assistant answers.
// Supports: fenced code blocks, ### headings, **bold**, *italic*, `inline code`,
// unordered/ordered lists (including indented sub-bullets under numbered points),
// pipe tables and paragraphs. Output is plain React elements (no HTML injection).

interface InlineToken {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [{ text }]
  const applyPattern = (
    pattern: RegExp,
    flag: 'bold' | 'italic' | 'code',
  ): void => {
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (token.bold || token.italic || token.code) continue
      const parts = token.text.split(pattern)
      if (parts.length === 1) continue
      const next: InlineToken[] = []
      parts.forEach((part, index) => {
        if (index % 2 === 0) {
          if (part.length > 0) next.push({ text: part })
        } else {
          next.push({ text: part, [flag]: true })
        }
      })
      tokens.splice(i, 1, ...next)
      i += next.length - 1
    }
  }
  applyPattern(/`([^`]+)`/g, 'code')
  applyPattern(/\*\*([^*]+)\*\*/g, 'bold')
  applyPattern(/\*([^*]+)\*/g, 'italic')
  return tokens
}

export function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((token, index) => {
    if (token.code) return <code key={index} className="inline-code">{token.text}</code>
    if (token.bold) return <strong key={index}>{token.text}</strong>
    if (token.italic) return <em key={index}>{token.text}</em>
    return <span key={index}>{token.text}</span>
  })
}

export interface ListItem {
  text: string
  children: string[]
}

export interface MarkdownBlock {
  type: 'paragraph' | 'heading' | 'bullet-list' | 'ordered-list' | 'code' | 'table'
  level?: number
  language?: string
  lines: string[]
  items?: ListItem[]
  start?: number
  header?: string[]
  rows?: string[][]
}

const BULLET = /^[-•*]\s+/
const INDENTED_BULLET = /^\s{2,}[-•*]\s+.+$/
const ORDERED = /^(\d+)[.)]\s+(.*)$/

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
}

function looksLikeTableStart(lines: string[], index: number): boolean {
  const line = lines[index]
  if (!line.includes('|') || line.trim().length === 0) return false
  const next = index + 1 < lines.length ? lines[index + 1] : ''
  // A separator row on the next line confirms a real table. While streaming,
  // the separator may not have arrived yet — treat it as a paragraph then.
  return isTableSeparator(next)
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')

  let index = 0
  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '') {
      index += 1
      continue
    }

    const fenceMatch = /^```(\w*)\s*$/.exec(line.trim())
    if (fenceMatch) {
      const language = fenceMatch[1] || ''
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1 // skip closing fence
      blocks.push({ type: 'code', language, lines: codeLines })
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line.trim())
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, lines: [headingMatch[2]] })
      index += 1
      continue
    }

    if (looksLikeTableStart(lines, index)) {
      const header = splitTableRow(line)
      index += 2 // skip header + separator
      const rows: string[][] = []
      while (
        index < lines.length &&
        lines[index].trim() !== '' &&
        lines[index].includes('|')
      ) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', lines: [], header, rows })
      continue
    }

    // Ordered point: "1. **Heading**" optionally followed by indented sub-bullets.
    const orderedMatch = ORDERED.exec(line.trim())
    if (orderedMatch && !INDENTED_BULLET.test(line)) {
      const start = Number(orderedMatch[1])
      const items: ListItem[] = []
      while (index < lines.length) {
        const itemMatch = ORDERED.exec(lines[index].trim())
        if (!itemMatch || INDENTED_BULLET.test(lines[index])) break
        const item: ListItem = { text: itemMatch[2], children: [] }
        index += 1
        while (index < lines.length && INDENTED_BULLET.test(lines[index])) {
          item.children.push(lines[index].trim().replace(BULLET, ''))
          index += 1
        }
        items.push(item)
      }
      blocks.push({ type: 'ordered-list', lines: [], items, start })
      continue
    }

    if (BULLET.test(line.trim())) {
      const items: ListItem[] = []
      while (index < lines.length && BULLET.test(lines[index].trim()) && !INDENTED_BULLET.test(lines[index])) {
        items.push({ text: lines[index].trim().replace(BULLET, ''), children: [] })
        index += 1
      }
      blocks.push({ type: 'bullet-list', lines: [], items })
      continue
    }

    // Paragraph: consume consecutive plain lines.
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^```/.test(lines[index].trim()) &&
      !/^(#{1,3})\s+/.test(lines[index].trim()) &&
      !BULLET.test(lines[index].trim()) &&
      !ORDERED.test(lines[index].trim()) &&
      !looksLikeTableStart(lines, index)
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraph })
  }

  return blocks
}
