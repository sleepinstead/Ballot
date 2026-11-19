/**
 * The command menu.
 *
 * Ctrl/⌘ + K from anywhere in the console. It lists the sections the signed-in role
 * may open, the elections on this server and a few actions, filters as you type and
 * runs the highlighted entry on Enter. It is the fast path; the tab strip under the
 * header is the visible one.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../ui/Icon'

export type Command = {
  id: string
  label: string
  hint?: string
  group: 'Go to' | 'Elections' | 'Actions'
  icon: IconName
  run: () => void
}

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(needle))
  }, [commands, query])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (command?: Command) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  let lastGroup = ''
  return (
    <div
      className="cmdk-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command menu" onKeyDown={onKeyDown}>
        <div className="cmdk-input">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections, elections and actions"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className="cmdk-empty">No matches for “{query}”.</li>}
          {results.map((command, index) => {
            const header = command.group !== lastGroup
            lastGroup = command.group
            return (
              <li key={command.id} role="presentation">
                {header && <p className="cmdk-group">{command.group}</p>}
                <button
                  type="button"
                  id={`cmdk-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={`cmdk-item${index === active ? ' active' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <Icon name={command.icon} />
                  <span className="cmdk-label">{command.label}</span>
                  {command.hint && <span className="cmdk-hint">{command.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
