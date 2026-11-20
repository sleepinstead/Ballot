/**
 * First-run onboarding.
 *
 * A small card that rises into the corner of the screen the first time someone
 * reaches a surface, walks through three or four plain statements, and then stays
 * out of the way. It never blocks the page: there is no scrim, focus is not
 * trapped, and Escape or "Skip" dismisses it for good.
 *
 * Each surface owns its own copy and its own storage key, so a voter who has seen
 * the voter tour still gets the administrator one the first time they sign in to
 * the console. `replayOnboarding(id)` brings a tour back from a "Take the tour"
 * link without any shared state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export type OnboardingArt = 'ballot' | 'table' | 'shield' | 'receipt' | 'nav' | 'command'

export type OnboardingStep = {
  title: string
  body: string
  art: OnboardingArt
}

const KEY = (id: string) => `ballot.onboarding.${id}.v1`
const EVENT = 'ballot:onboarding'

function seen(id: string): boolean {
  try {
    return window.localStorage.getItem(KEY(id)) === 'done'
  } catch {
    // Storage blocked: show it once per page load rather than on every render.
    return false
  }
}

function remember(id: string) {
  try {
    window.localStorage.setItem(KEY(id), 'done')
  } catch {
    /* A browser that cannot store a preference simply asks again next visit. */
  }
}

/** Bring a tour back, from anywhere. */
export function replayOnboarding(id: string) {
  try {
    window.localStorage.removeItem(KEY(id))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

/** Small wireframe illustrations, drawn from the same greys as the app. */
function Art({ kind }: { kind: OnboardingArt }) {
  switch (kind) {
    case 'ballot':
      return (
        <div className="ob-art ob-art-ballot" aria-hidden="true">
          <div className="ob-row"><span className="ob-radio ob-on" /><span className="ob-line ob-w60" /></div>
          <div className="ob-row"><span className="ob-radio" /><span className="ob-line ob-w45" /></div>
          <div className="ob-row"><span className="ob-radio" /><span className="ob-line ob-w70" /></div>
          <span className="ob-pill" />
        </div>
      )
    case 'table':
      return (
        <div className="ob-art ob-art-table" aria-hidden="true">
          {[0, 1, 2, 3].map((r) => (
            <div className={`ob-row${r === 1 ? ' ob-active' : ''}`} key={r}>
              <span className="ob-check" />
              <span className="ob-line ob-w30" />
              <span className="ob-line ob-w45" />
            </div>
          ))}
        </div>
      )
    case 'shield':
      return (
        <div className="ob-art ob-art-code" aria-hidden="true">
          <div className="ob-boxes">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className={`ob-box${n < 5 ? ' ob-filled' : ''}`} />
            ))}
          </div>
          <span className="ob-pill" />
        </div>
      )
    case 'receipt':
      return (
        <div className="ob-art ob-art-receipt" aria-hidden="true">
          <span className="ob-line ob-w45" />
          <span className="ob-hash" />
          <span className="ob-line ob-w60" />
        </div>
      )
    case 'nav':
      return (
        <div className="ob-art ob-art-nav" aria-hidden="true">
          <div className="ob-tabs">
            <span className="ob-tab ob-on" />
            <span className="ob-tab" />
            <span className="ob-tab" />
            <span className="ob-tab" />
          </div>
          <div className="ob-row"><span className="ob-line ob-w60" /></div>
          <div className="ob-row"><span className="ob-line ob-w45" /></div>
        </div>
      )
    case 'command':
      return (
        <div className="ob-art ob-art-command" aria-hidden="true">
          <div className="ob-search"><span className="ob-line ob-w30" /></div>
          <div className="ob-row ob-active"><span className="ob-line ob-w45" /></div>
          <div className="ob-row"><span className="ob-line ob-w60" /></div>
        </div>
      )
  }
}

export function Onboarding({
  id,
  steps,
  delayMs = 700,
  auto = true,
}: {
  id: string
  steps: OnboardingStep[]
  delayMs?: number
  /** Open by itself on a first visit. Off where a tour would cover the page's main action. */
  auto?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (seen(id)) return
    if (!auto) return
    const timer = window.setTimeout(() => setOpen(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [id, delayMs, auto])

  useEffect(() => {
    const onReplay = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) return
      setIndex(0)
      setOpen(true)
    }
    window.addEventListener(EVENT, onReplay)
    return () => window.removeEventListener(EVENT, onReplay)
  }, [id])

  const close = useCallback(() => {
    remember(id)
    setOpen(false)
  }, [id])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const step = steps[index]
  const last = index === steps.length - 1

  return (
    <aside className="onboarding" role="dialog" aria-label="Getting started" aria-live="polite">
      <button type="button" className="onboarding-close" aria-label="Skip the tour" onClick={close}>
        <Icon name="close" />
      </button>
      <div className="onboarding-art">
        <Art kind={step.art} />
      </div>
      <div className="onboarding-body">
        <p className="onboarding-step">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="onboarding-title">{step.title}</h2>
        <p className="onboarding-text">{step.body}</p>
      </div>
      <div className="onboarding-foot">
        <span className="onboarding-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === index ? ' on' : ''}`} />
          ))}
        </span>
        <span className="onboarding-actions">
          {index > 0 ? (
            <button type="button" className="onboarding-btn" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="onboarding-btn" onClick={close}>
              Skip
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            className="onboarding-btn onboarding-btn-primary"
            onClick={() => (last ? close() : setIndex(index + 1))}
          >
            {last ? 'Get started' : 'Next'}
          </button>
        </span>
      </div>
    </aside>
  )
}

export const WELCOME_STEPS: OnboardingStep[] = [
  {
    art: 'ballot',
    title: 'Welcome to Ballot',
    body: 'A private workspace for running an election from one machine. Here is the short version.',
  },
  {
    art: 'table',
    title: 'Organizers set it up',
    body: 'Create an election, add candidates, import the voter roll, then open the poll. Roles decide who may do what.',
  },
  {
    art: 'shield',
    title: 'Voters verify, then vote',
    body: 'A one-time code confirms who is voting. No account and no password.',
  },
  {
    art: 'receipt',
    title: 'Secret by structure',
    body: 'A ballot is never stored against the person who cast it. The receipt proves it was counted without revealing the choice.',
  },
]

export const VOTER_STEPS: OnboardingStep[] = [
  { art: 'table', title: 'Choose your election', body: 'Only elections you are on the roll for will let you in.' },
  { art: 'shield', title: 'Verify with a code', body: 'Enter your voter ID and the one-time code sent to you.' },
  { art: 'receipt', title: 'Vote once, keep the receipt', body: 'Review your choices before casting. The receipt is your proof, and it never shows your vote.' },
]

export const ADMIN_STEPS: OnboardingStep[] = [
  { art: 'nav', title: 'Everything is along the top', body: 'Work with elections, people and results from the tabs. Governance sits to the right.' },
  { art: 'command', title: 'Jump anywhere', body: 'Press Ctrl or ⌘ + K to search sections and elections from any screen.' },
  { art: 'receipt', title: 'Every action is recorded', body: 'Sensitive changes ask you to confirm and are written to the audit log with who did them.' },
]
