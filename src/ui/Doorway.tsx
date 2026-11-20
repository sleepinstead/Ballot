/**
 * The front door, at `#/` and `#/enter`.
 *
 * It answers one question — "where do I go?" — for two very different people. A
 * voter wants the ballot; an officer wants the console. So the page leads with
 * both doors as plain buttons beside the headline, ahead of anything else, and
 * everything below them is for the visitor who wants to know what this is first.
 *
 * The hero's other half is a specimen ballot that can be marked. It is the
 * product's one device — the ballot oval — doing what it does everywhere else,
 * so a first-time visitor has already used the voting control before they reach
 * a real ballot.
 *
 * The administrator door is a link to `#/admin`, which is the sign-in page while
 * signed out.
 */

import { useState } from 'react'
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

const SPECIMEN = ['Amara Rivera', 'Malik Okafor', 'Johanna Lindqvist']

/**
 * A ballot a visitor can mark.
 *
 * Nothing is sent anywhere. Marking an oval fills it and tears off a sample
 * receipt, which is the whole voting experience in miniature.
 */
function SpecimenBallot() {
  const [marked, setMarked] = useState<number | null>(null)

  return (
    <div className="specimen" role="group" aria-labelledby="specimen-title">
      <div className="specimen-sheet">
        <div className="specimen-head">
          <span className="specimen-kicker">Specimen ballot</span>
          <p className="specimen-title" id="specimen-title">Student council president</p>
        </div>
        <p className="specimen-instr">Mark one choice. Try it — nothing is recorded.</p>
        <ul className="specimen-options">
          {SPECIMEN.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                className={`specimen-option${marked === index ? ' is-marked' : ''}`}
                aria-pressed={marked === index}
                onClick={() => setMarked(marked === index ? null : index)}
              >
                <span className="specimen-oval" aria-hidden="true" />
                {name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={`specimen-stub${marked !== null ? ' is-shown' : ''}`} aria-live="polite">
        {marked !== null ? (
          <>
            <span className="specimen-stub-label">Receipt code</span>
            <span className="specimen-stub-code">7F3A-91C2-E04B</span>
            <span className="specimen-stub-note">Proves the ballot was counted. Doesn&rsquo;t show the choice.</span>
          </>
        ) : (
          <span className="specimen-stub-note">Your receipt appears here once you mark a choice.</span>
        )}
      </div>
    </div>
  )
}
