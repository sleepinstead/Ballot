/**
 * Voter interface.
 *
 * A linear flow: pick an election, prove identity, review the ballot, vote,
 * receive a receipt. Every screen reflects the lifecycle state the server
 * reports, and the ballot itself is only rendered when the server says voting
 * is open, so a voter is never left guessing why they cannot proceed.
 *
 * The picker groups elections by what a voter can do with them: open now,
 * coming up, closed. Once an election is chosen the frame is constant: a way back,
 * the step bar, the election's name, then a single focused column.
 * Only the column's contents change, which keeps a voter oriented.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  forgetVoterSession,
  markVoterSession,
  voterApi,
  voterSessionElection,
  type VoterBallotResult,
  type VoterBeginResult,
} from '../lib/api'
import { describeVotableState, formatWindow } from '../lib/time'
import {
  ELECTION_TYPE_LABELS,
  SPECIAL_OPTION_IDS,
  type BallotOption,
  type ElectionStatus,
  type ElectionSummary,
} from '../lib/types'
import { Alert, Countdown, DemoNote, EmptyState, Eyebrow, Field, Modal, StatusBadge } from '../ui/primitives'
import { Icon, type IconName } from '../ui/Icon'
import { ResultsPanel } from './ResultsPanel'

type Stage = 'pick' | 'preview' | 'identify' | 'codes' | 'ballot' | 'receipt' | 'results'

/**
 * The stages the progress indicator names, in order.
 *
 * One entry per stage a voter can be on once they have chosen an election. The
 * picker itself is not a step: a progress bar on the first screen only says how
 * far there is to go before anything has started.
 */
const STEPS = [
  { id: 'preview', label: 'Overview' },
  { id: 'identify', label: 'Your ID' },
  { id: 'codes', label: 'Code' },
  { id: 'ballot', label: 'Ballot' },
  { id: 'receipt', label: 'Receipt' },
] as const

function stepFor(stage: Stage): number {
  if (stage === 'pick' || stage === 'preview') return 0
  if (stage === 'identify') return 1
  if (stage === 'codes') return 2
  if (stage === 'ballot') return 3
  // 'results' is not a stage of its own — it is a detour off the ballot, reached
  // from a stage already passed, so it keeps that stage's marker rather than
  // inventing one.
  // On the receipt every step is behind the voter, so every bar is filled.
  if (stage === 'receipt') return STEPS.length
  return 3
}

/**
 * How the picker groups elections: by what a voter can do with each one.
 */
type ElectionGroupId = 'open' | 'upcoming' | 'closed'
const ELECTION_GROUPS: { id: ElectionGroupId; title: string }[] = [
  { id: 'open', title: 'Open now' },
  { id: 'upcoming', title: 'Coming up' },
  { id: 'closed', title: 'Closed' },
]
function groupFor(status: ElectionStatus): ElectionGroupId {
  if (status === 'open') return 'open'
  if (status === 'closed' || status === 'certified' || status === 'archived') return 'closed'
  return 'upcoming'
}

type Flash = { tone: 'info' | 'warn' | 'error' | 'success'; text: string } | null

/**
 * Copy to the clipboard, reporting whether it worked.
 *
 * The receipt code is the only record a voter keeps, so the copy affordance has
 * to acknowledge itself either way rather than silently doing nothing when the
 * browser refuses clipboard access.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function optionLabel(option: BallotOption) {
  return option.kind === 'candidate' ? option.name : option.name
}

function ballotPurpose(description: string, title: string, type: string) {
  const outOfScope = /\b(candidates?|voters? rank|choices?|options?|preferential ballot|single transferable|voting (?:opens|closed|will)|results?|tally|certif\w*|draft|published|paused|archived|standing order|never published|whether\b.*\bor\b)\b/i
  const summary = description
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !outOfScope.test(sentence))
    .join(' ')
    .trim()
  const purpose = summary || `This ballot is for the ${type.toLowerCase()} titled “${title}.”`
  return `${purpose} The ballot records the official outcome of this election.`
}

function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items]
  // Deterministic per-session shuffle so a reload does not reorder the ballot.
  let state = seed || 1
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    const j = state % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * The progress indicator.
 *
 * A bar per stage with the label beneath it. The bar carries the state — filled
 * where the voter has been and where they are, empty ahead — so progress reads
 * at a glance without counting.
 */
function StageSteps({ activeStep }: { activeStep: number }) {
  return (
    <nav aria-label="Progress">
      <ol className="steps">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            className={`step-slot${
              index === activeStep ? ' step-active' : index < activeStep ? ' step-done' : ''
            }`}
            aria-current={index === activeStep ? 'step' : undefined}
          >
            <span className="step-bar" aria-hidden="true" />
            <span className="step-label">
              {step.label}
              {index < activeStep && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function VoterFlow({
  elections,
  serverOffsetMs,
  onChanged,
}: {
  elections: ElectionSummary[]
  serverOffsetMs: number
  onChanged: () => void
}) {
  const [electionId, setElectionId] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [flash, setFlash] = useState<Flash>(null)
  const [begin, setBegin] = useState<VoterBeginResult | null>(null)
  const [ballot, setBallot] = useState<VoterBallotResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [identifier, setIdentifier] = useState('')
  /** Codes are keyed by challenge id, so the form never handles a channel index. */
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [receipt, setReceipt] = useState<{ receipts: string[]; submittedAt: string; digest: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const election = useMemo(
    () => elections.find((item) => item.id === electionId) ?? null,
    [elections, electionId],
  )

  /**
   * Try to pick up an existing verified session.
   *
   * A refusal is not a failure. The cookie is `HttpOnly`, so the page cannot know
   * whether it holds a session and has to ask; the ordinary answer on a first
   * visit is "no", and that must not be reported to a voter as an error or a
   * warning. Only a refusal that is *not* about the session — the election closed
   * underneath them, the server is down — is worth showing.
   */
  const loadBallot = useCallback(async (id: string) => {
    const result = await voterApi.ballot(id)
    if (!result.ok) {
      if (result.code === 'unauthorized' || result.code === 'not_found') return false
      setFlash({ tone: 'error', text: result.error })
      return false
    }
    setBallot(result.value)
    return true
  }, [])

  /*
   * Resume an in-progress verification when the page is reloaded.
   *
   * The session cookie is `HttpOnly`, so the page cannot check whether it exists
   * — it asks the server. Only the server's answer decides whether a ballot is
   * shown, which is the whole point: nothing here can manufacture a session.
   */
  useEffect(() => {
    if (!electionId || stage !== 'identify') return
    let cancelled = false
    void (async () => {
      const result = await voterApi.ballot(electionId)
      if (cancelled) return
      if (result.ok) {
        markVoterSession(true, electionId)
        setBallot(result.value)
        // Deliberately 'ballot' whether or not the vote is already cast. BallotStage
        // reads `has_voted` and renders the "You have already voted" card itself, and
        // that card is the correct screen for a *resumed* session.
        //
        // The 'receipt' stage used to be chosen here when `has_voted` was true. But
        // the receipt payload only exists in memory for the response to a vote this
        // page just submitted — the server will not hand back a digest on a later
        // request, because the ballot is deliberately not retrievable by identity.
        // So on a reload, or in a second tab sharing the HttpOnly cookie, `receipt`
        // was null while `stage` was 'receipt', and the `{stage === 'receipt' &&
        // receipt && ...}` guard rendered nothing at all: a blank page for a voter
        // who had already voted, with no receipt and no way forward. 'Receipt' now
        // means exactly "just submitted, and here is the payload".
        setStage('ballot')
      } else {
        forgetVoterSession()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [electionId, stage])

  const openElection = useCallback(
    (id: string) => {
      setElectionId(id)
      setFlash(null)
      setBallot(null)
      setBegin(null)
      setReceipt(null)
      setCodes({})
      setStage('preview')
    },
    [],
  )

  /** Closed elections have nothing to vote on, so they open straight onto their results. */
  const openResults = useCallback((id: string) => {
    setElectionId(id)
    setFlash(null)
    setStage('results')
  }, [])

  const state = useMemo(() => {
    if (!election) return null
    return describeVotableState({
      status: election.effective_status,
      startsAt: election.starts_at,
      endsAt: election.ends_at,
      serverOffsetMs,
    })
  }, [election, serverOffsetMs])

  const submitIdentifier = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!election) return
    setBusy(true)
    setFlash(null)
    const result = await voterApi.begin(election.id, identifier.trim())
    setBusy(false)
    if (!result.ok) {
      setFlash({ tone: 'error', text: result.error })
      return
    }
    setBegin(result.value)
    // A null identity is the deliberate "we are not telling you" response for an
    // identifier that is not on the roll. The form still asks for a code, so the
    // screen looks identical either way and reveals nothing.
    setCodes({})
    setStage(result.value.requires_code && result.value.challenges.length > 0 ? 'codes' : 'ballot')
  }

  const submitCodes = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!election || !begin) return
    setBusy(true)
    setFlash(null)
    const answers = begin.challenges
      .map((challenge) => ({ challenge_id: challenge.challenge_id, code: (codes[challenge.challenge_id] ?? '').trim() }))
      .filter((answer) => answer.code.length > 0)
    const result = await voterApi.verify(election.id, begin.voter?.voter_id ?? identifier.trim(), answers)
    setBusy(false)
    if (!result.ok) {
      setFlash({ tone: 'error', text: result.error })
      return
    }
    // No token to store: the server has set an HttpOnly cookie.
    markVoterSession(true, election.id)
    await loadBallot(election.id)
    setStage('ballot')
  }

  /**
   * Ask for a fresh voting credential.
   *
   * Needed because the credential is deliberately short lived: a voter who paused
   * to read a long ballot can come back to it without re-entering their
   * verification code. The server still holds the authenticated session, so this is
   * not a way around verification.
   */
  const requestCredential = useCallback(async () => {
    if (!election) return
    setBusy(true)
    setFlash(null)
    const result = await voterApi.credential(election.id)
    setBusy(false)
    if (!result.ok) {
      setFlash({ tone: 'error', text: result.error })
      return
    }
    await loadBallot(election.id)
  }, [election, loadBallot])

  const signOut = async () => {
    if (election) await voterApi.logout(election.id)
    forgetVoterSession()
    setBallot(null)
    setBegin(null)
    setReceipt(null)
    setStage('identify')
    setFlash(null)
    onChanged()
  }

  const back = () => {
    setStage('pick')
    setElectionId(null)
    setFlash(null)
  }

  /* ------------------------------------------------------------ the picker --- */

  if (elections.length === 0) {
    return (
      <div className="voter-shell voter-shell-wide">
        <EmptyState title="No elections are open to voters yet" icon="ballot">
          <p>When an administrator publishes an election, it will appear here. Check back later or contact your election officer.</p>
        </EmptyState>
      </div>
    )
  }

  if (stage === 'pick' || !election || !state) {
    const listed = elections.filter((item) => item.status !== 'archived')
    const groups = ELECTION_GROUPS.map((group) => ({
      ...group,
      items: listed.filter((item) => groupFor(item.effective_status) === group.id),
    })).filter((group) => group.items.length > 0)

    return (
      <div className="voter-shell voter-shell-wide">
        <header className="voter-intro">
          <h1>Choose your election</h1>
          <p>
            Pick the election you were invited to vote in. You&rsquo;ll confirm who you are before you see the
            ballot, and your choices are never stored with your name.
          </p>
        </header>

        {groups.map((group) => (
          <section className="election-group" key={group.id} aria-labelledby={`group-${group.id}`}>
            <h2 className="election-group-title" id={`group-${group.id}`}>
              {group.title}
              <span className="election-group-count">{group.items.length}</span>
            </h2>
            <div className="election-list">
              {group.items.map((item) => {
                const itemState = describeVotableState({
                  status: item.effective_status,
                  startsAt: item.starts_at,
                  endsAt: item.ends_at,
                  serverOffsetMs,
                })
                const window_ = formatWindow(item.starts_at, item.ends_at, item.timezone)
                const action =
                  group.id === 'closed' ? 'See results' : group.id === 'open' && itemState.canVote ? 'Vote' : 'View details'
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`election-row election-row-${group.id}`}
                    onClick={() => (group.id === 'closed' ? openResults(item.id) : openElection(item.id))}
                  >
                    <span className="election-row-main">
                      <span className="election-row-meta">
                        <StatusBadge status={item.status} effective={item.effective_status} />
                        <span className="election-row-type">{ELECTION_TYPE_LABELS[item.election_type]}</span>
                      </span>
                      <span className="election-row-title">{item.title}</span>
                      {item.description && <span className="election-row-desc">{item.description}</span>}
                    </span>
                    <span className="election-row-when">
                      <span className="election-row-window">
                        {window_.label}
                        {window_.zone && <span className="election-row-zone">{window_.zone}</span>}
                      </span>
                      <span className="election-row-next">
                        {itemState.nextChangeAt !== null ? (
                          <Countdown
                            targetAt={itemState.nextChangeAt}
                            serverOffsetMs={serverOffsetMs}
                            prefix={`${itemState.nextChangeLabel ?? 'Changes'} `}
                          />
                        ) : (
                          itemState.headline
                        )}
                      </span>
                    </span>
                    <span className="election-row-action">
                      {action}
                      <Icon name="chevron-right" />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    )
  }

  /* ------------------------------------------------------------- the flow --- */

  const activeStep = stepFor(stage)
  const typeLabel = ELECTION_TYPE_LABELS[election.election_type]
  const purpose = ballotPurpose(election.description, election.title, typeLabel)
  const window_ = formatWindow(election.starts_at, election.ends_at, election.timezone)
  const identifierLabel = election.eligibility.identifierLabel || 'voter ID'
  // The ballot sheet carries the election's name in its own header.
  const showContext = stage !== 'preview' && stage !== 'results' && stage !== 'ballot'

  return (
    <div className={`voter-shell${stage === 'results' ? ' voter-shell-wide' : ''}`}>
      <div className="voter-frame-top">
        <button type="button" className="workspace-back" onClick={back}>
          <Icon name="arrow-left" />
          All elections
        </button>
        {stage !== 'results' && <StageSteps activeStep={activeStep} />}
      </div>

      {showContext && (
        <p className="voter-context-line">
          <span className="voter-context-title">{election.title}</span>
          <StatusBadge status={election.status} effective={election.effective_status} />
        </p>
      )}

      {flash && (
        <div className="voter-flash">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}

      {stage === 'preview' && (
        <div className="focus-card">
          <div className="focus-head">
            <div>
              <Eyebrow>{typeLabel}</Eyebrow>
              <h1>{election.title}</h1>
            </div>
          </div>

          <div className="ballot-heading">
            <h2 className="ballot-description-title">Description</h2>
            <p>{purpose}</p>
          </div>

          <dl className="voter-facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={election.status} effective={election.effective_status} />
              </dd>
            </div>
            <div>
              <dt>Voting window</dt>
              <dd>
                {window_.label}
                {window_.zone && <span className="voter-facts-sub">{window_.zone}</span>}
              </dd>
            </div>
            <div>
              <dt>{state.nextChangeAt !== null ? state.nextChangeLabel ?? 'Next change' : 'Right now'}</dt>
              <dd>
                {state.nextChangeAt !== null ? (
                  <Countdown targetAt={state.nextChangeAt} serverOffsetMs={serverOffsetMs} />
                ) : (
                  state.headline
                )}
              </dd>
            </div>
            <div>
              <dt>You&rsquo;ll need</dt>
              <dd>
                Your {identifierLabel}
                {election.rules.requireOtp ? ' and a one-time code' : ''}
              </dd>
            </div>
          </dl>

          <button type="button" className="btn-primary btn-block btn-lg" onClick={() => setStage('identify')}>
            Continue to verification
          </button>
          {!state.canVote && <p className="focus-foot">{state.detail}</p>}
        </div>
      )}

      {stage === 'identify' && (
        <form className="focus-card" onSubmit={submitIdentifier}>
          <div className="focus-head">
            <div>
              <h1>Cast your ballot securely.</h1>
              <p>
                Enter the {identifierLabel} issued to you for this election. Who you are and how you vote are stored
                separately, so the two can never be linked.
              </p>
            </div>
          </div>

          {!state.canVote && (
            <Alert tone="warn">
              {state.headline}. You can&rsquo;t vote in this election right now.
              <button type="button" className="link-button inline" onClick={() => setStage('results')}>
                View results
              </button>
            </Alert>
          )}

          <Field label={election.eligibility.identifierLabel || 'Voter ID'} htmlFor="identifier">
            <input
              id="identifier"
              type="text"
              value={identifier}
              autoComplete="off"
              autoFocus={state.canVote}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="e.g. STU-2026-0001"
              required
              disabled={!state.canVote}
            />
          </Field>

          {election.eligibility.notes && <p className="voter-info-note">{election.eligibility.notes}</p>}

          {state.nextChangeAt !== null && (
            <p className="voter-state-bar">
              <Icon name="clock" />
              <Countdown targetAt={state.nextChangeAt} serverOffsetMs={serverOffsetMs} prefix={`${state.nextChangeLabel} `} />
            </p>
          )}

          <button type="submit" className="btn-primary btn-block btn-lg" disabled={busy || !state.canVote}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>

          <p className="focus-foot">Not sure what your {identifierLabel} is? Ask your election officer.</p>
        </form>
      )}

      {stage === 'codes' && begin && (
        <form className="focus-card" onSubmit={submitCodes}>
          <div className="focus-head">
            <div>
              <h1>Enter your code.</h1>
              <p>
                {/*
                 * One wording, always. The server does not say whether this identifier
                 * is on the roll, so neither does the screen: it would be pointless to
                 * ask the browser to keep a secret the response never carried.
                 */}
                We&rsquo;ve sent a one-time code to the contact details registered to you. Codes expire after a few
                minutes.
              </p>
            </div>
          </div>

          {begin.demo_codes && (
            <DemoNote>
              <strong>Demo build.</strong> Your codes are
              {begin.demo_codes.phone && (
                <>
                  {' '}phone <code>{begin.demo_codes.phone}</code>
                </>
              )}
              {begin.demo_codes.phone && begin.demo_codes.email && ' and'}
              {begin.demo_codes.email && (
                <>
                  {' '}email <code>{begin.demo_codes.email}</code>
                </>
              )}
              . They change on every attempt.
            </DemoNote>
          )}

          {begin.challenges.map((challenge, index) => (
            <Field
              key={challenge.challenge_id}
              label={challenge.channel === 'phone' ? 'Code sent by text message' : 'Code sent by email'}
              htmlFor={`code-${challenge.channel}`}
              hint={`Valid for ${challenge.expires_in} seconds. A wrong code counts as one attempt.`}
            >
              <input
                id={`code-${challenge.channel}`}
                className="otp-field"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus={index === 0}
                maxLength={challenge.digits}
                placeholder={'•'.repeat(challenge.digits)}
                value={codes[challenge.challenge_id] ?? ''}
                onChange={(event) =>
                  setCodes((current) => ({
                    ...current,
                    [challenge.challenge_id]: event.target.value
                      .replace(/\D/g, '')
                      .slice(0, challenge.digits),
                  }))
                }
                required
              />
            </Field>
          ))}

          <button type="submit" className="btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and open ballot'}
          </button>
          <div className="focus-foot">
            <button type="button" className="link-secondary" onClick={() => setStage('identify')}>
              Use a different {identifierLabel}
            </button>
          </div>
        </form>
      )}

      {stage === 'ballot' && !ballot && (
        <VoterMessage tone="stop" icon="warning" title="Your ballot could not be opened">
          <p>
            The server didn&rsquo;t return a ballot. You haven&rsquo;t used your vote — a vote only counts once you
            submit it. Try again, or go back and choose the election again.
          </p>
          <div className="voter-message-actions">
            <button type="button" className="btn-outline" onClick={back}>
              All elections
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFlash(null)
                void openElection(election.id)
              }}
            >
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        </VoterMessage>
      )}

      {stage === 'ballot' && ballot && (
        <BallotStage
          ballot={ballot}
          busy={busy}
          setBusy={setBusy}
          onVoted={async (payload) => {
            setReceipt(payload)
            setCopied(false)
            setStage('receipt')
            await loadBallot(election.id)
            onChanged()
          }}
          onError={(text) => setFlash({ tone: 'error', text })}
          onRequestCredential={requestCredential}
        />
      )}

      {stage === 'receipt' && receipt && (
        <div className="confirmed-card">
          <div className="confirmed-top">
            <span className="confirmed-mark" aria-hidden="true">
              <Icon name="check" strokeWidth={2.5} />
            </span>
            <h2 className="confirmed-title">Your ballot is cast</h2>
            <p className="confirmed-subtitle">
              Keep the receipt code below. It proves a ballot was recorded for this election, and it can&rsquo;t
              reveal how you voted.
            </p>
          </div>

          {receipt.receipts.length > 0 && (
            <div className="receipt-box">
              <div className="receipt-label">Receipt code</div>
              {receipt.receipts.map((code) => (
                <div className="receipt-hash" key={code}>
                  {code}
                </div>
              ))}
              <button
                type="button"
                className="receipt-copy"
                onClick={() => {
                  void copyText(receipt.receipts.join('\n')).then((ok) => {
                    if (ok) setCopied(true)
                  })
                }}
              >
                <Icon name={copied ? 'check' : 'archive'} />
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
          )}

          <div className="receipt-note">
            <p>
              Your receipt can&rsquo;t be traced back to you, and it doesn&rsquo;t record your choice.
              {receipt.digest && (
                <>
                  {' '}Integrity digest <code>{receipt.digest.slice(0, 24)}…</code>
                </>
              )}
            </p>
          </div>

          <div className="confirmed-actions">
            <button type="button" className="btn-outline" onClick={() => setStage('results')}>
              View results
            </button>
            <button type="button" className="btn-primary" onClick={signOut}>
              Finish and sign out
            </button>
          </div>
        </div>
      )}

      {stage === 'results' && (
        <div className="voter-results">
          <header className="voter-intro voter-intro-compact">
            <Eyebrow>{typeLabel}</Eyebrow>
            <h1>{election.title}</h1>
          </header>
          <ResultsPanel electionId={election.id} onSignOut={voterSessionElection() === election.id ? signOut : undefined} />
        </div>
      )}
    </div>
  )
}

/** A centred message that stands in for a screen: a square badge, a title, a paragraph, actions. */
function VoterMessage({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'mark' | 'soon' | 'stop'
  icon: IconName
  title: string
  children: ReactNode
}) {
  return (
    <div className="voter-message">
      <span className={`voter-message-icon voter-message-${tone}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h1>{title}</h1>
      {children}
    </div>
  )
}

function BallotStage({
  ballot,
  busy,
  setBusy,
  onVoted,
  onError,
  onRequestCredential,
}: {
  ballot: VoterBallotResult
  busy: boolean
  setBusy: (value: boolean) => void
  onVoted: (payload: { receipts: string[]; submittedAt: string; digest: string }) => void | Promise<void>
  onError: (text: string) => void
  onRequestCredential: () => void
}) {
  const required = ballot.rules.votesPerVoter
  const [selected, setSelected] = useState<number[]>([])
  const [confirming, setConfirming] = useState(false)

  const options = useMemo(() => {
    if (!ballot.rules.randomizeBallotOrder) return ballot.options
    return shuffled(ballot.options, ballot.election.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 7))
  }, [ballot.options, ballot.rules.randomizeBallotOrder, ballot.election.id])

  const alreadyCast = ballot.has_voted
  const idsFor = (option: BallotOption) =>
    option.kind === 'nota' ? SPECIAL_OPTION_IDS.nota : option.kind === 'abstain' ? SPECIAL_OPTION_IDS.abstain : Number(option.key.split('-')[1])

  const toggle = (option: BallotOption) => {
    if (alreadyCast) return
    const id = idsFor(option)
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= required) return [...current.slice(1), id]
      return [...current, id]
    })
  }

  const submit = async () => {
    setBusy(true)
    const result = await voterApi.vote(ballot.election.id, selected)
    setBusy(false)
    if (!result.ok) {
      setConfirming(false)
      onError(result.error)
      return
    }
    setConfirming(false)
    await onVoted({
      receipts: result.value.receipts,
      submittedAt: result.value.submitted_at,
      digest: result.value.integrity_digest,
    })
  }

  if (alreadyCast) {
    return (
      <VoterMessage tone="mark" icon="check" title="You have already voted">
        <p>
          Your ballot for this election was recorded. Each voter can vote once, and because your ballot is not stored
          against your identity there&rsquo;s nothing to show you about what you chose. Your receipt is the record of
          it.
        </p>
      </VoterMessage>
    )
  }

  if (!ballot.can_vote) {
    return (
      <VoterMessage tone="soon" icon="clock" title="Your voting session timed out">
        <p>
          For security, the permission to vote only lasts a short time. Get a new one to continue — you don&rsquo;t
          need to verify your identity again.
        </p>
        <div className="voter-message-actions">
          <button type="button" className="btn-primary btn-lg" disabled={busy} onClick={onRequestCredential}>
            {busy ? 'Requesting…' : 'Continue voting'}
          </button>
        </div>
      </VoterMessage>
    )
  }

  const chosen = options.filter((option) => selected.includes(idsFor(option)))
  const complete = selected.length === required

  return (
    <div className="vote-content">
      <section className="ballot-sheet" aria-labelledby="ballot-title">
        <header className="ballot-sheet-head">
          <span className="ballot-sheet-kicker">Official ballot</span>
          <h2 id="ballot-title">{ballot.election.title}</h2>
        </header>
        <div className="ballot-sheet-instr">
          <span className="ballot-instr-box" aria-hidden="true" />
          <p>
            <strong>{required === 1 ? 'Mark one choice.' : `Mark ${required} choices.`}</strong> Select an option to
            tick its box. Select it again to clear it.
          </p>
        </div>
        <div className="candidate-list">
          {options.map((option) => {
            const id = idsFor(option)
            const isSelected = selected.includes(id)
            return (
              <label
                key={option.key}
                className={`candidate-row${isSelected ? ' selected' : ''}${option.kind !== 'candidate' ? ' special' : ''}`}
              >
                <input type="checkbox" name={`option-${option.key}`} checked={isSelected} onChange={() => toggle(option)} />
                <span className="radio-circle" aria-hidden="true" />
                {ballot.rules.showCandidateImages && option.image_url && option.kind === 'candidate' && (
                  <img className="candidate-photo" src={option.image_url} alt="" />
                )}
                <span className="candidate-info">
                  <span className="candidate-name">{optionLabel(option)}</span>
                  {option.organization && <span className="candidate-party">{option.organization}</span>}
                  {option.description && <span className="candidate-desc">{option.description}</span>}
                </span>
                {option.symbol && <span className="candidate-symbol">{option.symbol}</span>}
              </label>
            )
          })}
        </div>
      </section>

      <div className={`ballot-bar${complete ? ' ballot-bar-ready' : ''}`}>
        <span className="ballot-bar-count" aria-live="polite">
          <strong>
            {selected.length} of {required}
          </strong>{' '}
          marked
        </span>
        <button type="button" className="btn-submit-ballot" disabled={!complete} onClick={() => setConfirming(true)}>
          Review and submit
        </button>
      </div>
      <p className="ballot-privacy">
        <Icon name="lock" />
        Your choices are stored without your name. Nothing is recorded until you submit.
      </p>

      {confirming && (
        <Modal
          title="Check your ballot"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="btn-cancel" disabled={busy} onClick={() => setConfirming(false)}>
                Go back
              </button>
              <button type="button" className="btn-confirm" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Recording…' : 'Submit vote'}
              </button>
            </>
          }
        >
          <p className="modal-desc">You&rsquo;re about to submit a vote for:</p>
          {chosen.map((option) => (
            <div className="modal-candidate-card" key={option.key}>
              <span className="mc-box" aria-hidden="true" />
              <span>
                <span className="mc-name">{option.name}</span>
                {option.organization && <span className="mc-party">{option.organization}</span>}
              </span>
            </div>
          ))}
          <p className="modal-warning">
            {ballot.rules.allowVoteChange
              ? 'You can change this vote later while voting is open.'
              : 'You can’t change your vote after you submit it.'}
          </p>
        </Modal>
      )}
    </div>
  )
}
