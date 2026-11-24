/**
 * The front door, at `#/` and `#/enter`.
 *
 * It answers one question — "where do I go?" — for two very different people. A
 * voter wants the ballot; an officer wants the console. So the page leads with
 * both doors as plain buttons beside the headline, ahead of anything else, and
 * everything below them is for the visitor who wants to know what this is first.
 *
 * The hero's other half is a specimen ballot above a ballot box. A visitor can
 * mark it and cast it, so they have been through the whole vote in miniature
 * before they reach a real ballot.
 *
 * The administrator door is a link to `#/admin`, which is the sign-in page while
 * signed out.
 */

import { useEffect, useRef, useState } from 'react'
import { AuthFrame } from './Shell'
import { Onboarding, WELCOME_STEPS, replayOnboarding } from './Onboarding'

const YEAR = new Date().getFullYear()

export const DOOR_HERO = {
  headline: 'A polling station for clubs, councils and campuses.',
  lede:
    'Ballot runs a whole election from one machine: the ballot, the voter list, the count and the record of who did what. Voters confirm who they are with a one-time code, and their vote is stored without their name.',
  statement: 'Sign-in details never leave this server.',
  meta: `Ballot ${YEAR}`,
}

/** The four stages of an election. They are a real sequence, so they are numbered. */
const STEPS = [
  { title: 'Set up', detail: 'Create the election, add the candidates and import the voter list.' },
  { title: 'Verify', detail: 'Each voter enters their ID and a one-time code. No accounts, no passwords.' },
  { title: 'Vote', detail: 'One ballot per voter, recorded with no link back to the person.' },
  { title: 'Certify', detail: 'Close voting, check the count and certify it. Every step is logged.' },
]

export function Doorway() {
  return (
    <AuthFrame statement={DOOR_HERO.statement} meta={DOOR_HERO.meta}>
      <section className="door-hero" aria-labelledby="door-title">
        <div className="door-hero-copy">
          <h1 id="door-title">{DOOR_HERO.headline}</h1>
          <p className="door-lede">{DOOR_HERO.lede}</p>
          <div className="door-actions">
            <a href="#/vote" className="btn-primary btn-lg">
              Vote in an election
            </a>
            <a href="#/admin" className="btn-outline btn-lg">
              Sign in to manage elections
            </a>
          </div>
          <p className="door-note">Voters don&rsquo;t need an account or a password.</p>
        </div>
        <SpecimenBallot />
      </section>

      <section className="door-section" aria-labelledby="door-steps">
        <h2 id="door-steps" className="door-section-title">How an election runs</h2>
        <ol className="landing-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="landing-step">
              <span className="landing-step-n" aria-hidden="true">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="door-section entry-about" aria-labelledby="door-about">
        <h2 id="door-about" className="entry-about-headline">
          A ballot is never stored against the person who cast it.
        </h2>
        <p className="entry-about-detail">
          The voter list, the one-time codes and the audit log stay on this machine. What a voter takes away is a
          receipt code: proof that their ballot was counted, which can be checked later without revealing their
          choice.
        </p>
        <button type="button" className="link-button" onClick={() => replayOnboarding('welcome')}>
          Take the two-minute tour
        </button>
      </section>

      <Onboarding id="welcome" steps={WELCOME_STEPS} auto={false} />
    </AuthFrame>
  )
}

const SPECIMEN = [
  { name: 'Amara Rivera', group: 'Engineering' },
  { name: 'Malik Okafor', group: 'Law' },
  { name: 'Johanna Lindqvist', group: 'Medicine' },
]

/** How many ballots the demonstration box already holds. */
const BOX_START = 1283

/** Folded ballots already lying in the box, and where the next few land. */
const PILE = [
  { x: 4, y: 4, r: -6 }, { x: 19, y: 2, r: 4 }, { x: 33, y: 5, r: -2 }, { x: 47, y: 3, r: 7 },
  { x: 61, y: 4, r: -5 }, { x: 75, y: 2, r: 3 }, { x: 11, y: 14, r: 9 }, { x: 26, y: 16, r: -8 },
  { x: 54, y: 15, r: 5 }, { x: 68, y: 13, r: -3 },
]
const DROPS = [
  { x: 40, y: 22, r: -7 }, { x: 18, y: 25, r: 6 }, { x: 62, y: 24, r: -4 }, { x: 30, y: 31, r: 3 },
  { x: 50, y: 33, r: -9 }, { x: 72, y: 30, r: 8 },
]

type SpecimenStage = 'mark' | 'casting' | 'cast'

/** A receipt-shaped code that changes with each specimen ballot. */
function specimenCode(serial: number): string {
  const part = (n: number) => ((serial * n) % 65536).toString(16).toUpperCase().padStart(4, '0')
  return `${part(40503)}-${part(7919)}-${part(52711)}`
}

/**
 * The whole vote in miniature: a paper ballot above a ballot box.
 *
 * Marking a box ticks it. Casting folds the paper down through the slot, the
 * box's count goes up by one, and a receipt rises out of the slot in the
 * paper's place: proof the ballot was counted, with nothing about the choice
 * on it. Nothing is sent anywhere. With reduced motion the same three states
 * change instantly.
 */
function SpecimenBallot() {
  const [marked, setMarked] = useState<number | null>(null)
  const [stage, setStage] = useState<SpecimenStage>('mark')
  const [count, setCount] = useState(BOX_START)
  const [serial, setSerial] = useState(4217)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const cast = () => {
    if (marked === null || stage !== 'mark') return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setStage('casting')
    timer.current = window.setTimeout(() => {
      setStage('cast')
      setCount((current) => current + 1)
    }, still ? 0 : 700)
  }

  const again = () => {
    setMarked(null)
    setSerial((current) => current + 1)
    setStage('mark')
  }

  const code = specimenCode(serial)

  return (
    <div className={`specimen specimen-${stage}`} role="group" aria-labelledby="specimen-title">
      <div className="specimen-stage">
        {stage !== 'cast' ? (
          <div className="specimen-paper">
            <div className="specimen-stub">
              <span>Specimen ballot</span>
              <span className="specimen-serial">No. {String(serial).padStart(6, '0')}</span>
            </div>
            <div className="specimen-head">
              <p className="specimen-title" id="specimen-title">Student council president</p>
              <p className="specimen-instr">Mark one box, then cast it. Nothing is recorded.</p>
            </div>
            <ul className="specimen-options">
              {SPECIMEN.map((candidate, index) => (
                <li key={candidate.name}>
                  <button
                    type="button"
                    className={`specimen-option${marked === index ? ' is-marked' : ''}`}
                    aria-pressed={marked === index}
                    disabled={stage !== 'mark'}
                    onClick={() => setMarked(marked === index ? null : index)}
                  >
                    <span className="specimen-tick" aria-hidden="true" />
                    <span className="specimen-name">{candidate.name}</span>
                    <span className="specimen-group">{candidate.group}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="specimen-foot">
              <button
                type="button"
                className="btn-primary btn-block"
                disabled={marked === null || stage !== 'mark'}
                onClick={cast}
              >
                {marked === null ? 'Mark a box to cast' : 'Cast this ballot'}
              </button>
            </div>
          </div>
        ) : (
          <div className="specimen-receipt-wrap">
            <div className="specimen-receipt">
              <span className="specimen-receipt-label">Receipt code</span>
              <span className="specimen-receipt-code">{code}</span>
              <p className="specimen-receipt-note">
                Your ballot is in the box. This code proves it was counted. It can&rsquo;t show who you chose.
              </p>
              <button type="button" className="btn-outline btn-block" onClick={again}>
                Mark another ballot
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="specimen-ballot-box" aria-hidden="true">
        <div className="specimen-lid">
          <span className="specimen-slot" />
        </div>
        <div className="specimen-crate">
          <div className="specimen-pile">
            {PILE.map((slip, index) => (
              <span key={index} className="specimen-slip" style={{ left: `${slip.x}%`, bottom: slip.y }}>
                <span style={{ transform: `rotate(${slip.r}deg)` }} />
              </span>
            ))}
            {DROPS.slice(0, Math.min(count - BOX_START, DROPS.length)).map((slip, index, cast) => (
              <span
                key={`drop-${index}`}
                className={`specimen-slip${stage === 'cast' && index === cast.length - 1 ? ' is-new' : ''}`}
                style={{ left: `${slip.x}%`, bottom: slip.y }}
              >
                <span style={{ transform: `rotate(${slip.r}deg)` }} />
              </span>
            ))}
          </div>
          <div className="specimen-label">
            <span className="specimen-crate-label">Ballot box</span>
            <span className="specimen-count-wrap">
              <span className={`specimen-count${stage === 'cast' ? ' is-bumped' : ''}`} key={count}>
                {count.toLocaleString('en-US')}
              </span>
            </span>
            <span className="specimen-crate-sub">ballots cast</span>
          </div>
        </div>
        <div className="specimen-base" />
      </div>

      <p className="sr-only" aria-live="polite">
        {stage === 'cast' ? `Ballot cast. The box now holds ${count.toLocaleString('en-US')} ballots. Receipt code ${code}.` : ''}
      </p>
    </div>
  )
}
