/**
 * The administrator sign-in, at `#/admin` while signed out.
 *
 * Three states, because the server distinguishes them: creating the first
 * account, submitting a password, and satisfying a second factor.
 *
 * A password alone never opens a session once a second factor is configured. The
 * server returns "a second factor is required" instead of a session, and this
 * screen asks for the code. That is why the MFA step is a separate state rather
 * than an extra field on the form: a hidden field would invite a client to send
 * a password and a code together, which is exactly what must not happen.
 *
 * The page is a split screen. The left half is the election office: what this
 * server is running right now, read from the same public list the voter portal
 * shows, so an officer sees the state of things before they sign in. The right
 * half is the form and nothing else. The shared navigation bar sits above both,
 * so a voter who lands here by mistake is one click from Vote.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '../lib/api'
import type { ClientSession } from '../lib/adminTypes'
import type { ElectionSummary } from '../lib/types'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/Shell'
import { Alert, StatusBadge } from '../ui/primitives'

type Stage = 'password' | 'mfa'

export function AdminLogin({
  needsBootstrap,
  elections = [],
  onAuthenticated,
}: {
  needsBootstrap: boolean
  /** The public election list, for the office panel. Never anything private. */
  elections?: ElectionSummary[]
  onAuthenticated: (session: ClientSession) => void
}) {
  const [stage, setStage] = useState<Stage>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [mfaKnown, setMfaKnown] = useState<boolean | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  /*
   * Whether this account has a second factor, looked up while the username is
   * typed, so the screen can say "you'll be asked for a code next" before the
   * password is sent. Debounced, and only for usernames long enough to be real.
   */
  useEffect(() => {
    if (needsBootstrap || username.trim().length < 3) {
      setMfaKnown(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void authApi.status(username.trim()).then((result) => {
        if (!cancelled && result.ok) setMfaKnown(result.value.mfaEnabled)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [username, needsBootstrap])

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    if (needsBootstrap) {
      const created = await authApi.bootstrap({ username, password, display_name: displayName })
      setBusy(false)
      if (!created.ok) {
        setError(created.error)
        return
      }
      onAuthenticated(created.value.session)
      return
    }

    const signedIn = await authApi.login(username, password)
    setBusy(false)
    if (!signedIn.ok) {
      setError(signedIn.error)
      setPassword('')
      passwordRef.current?.focus()
      return
    }
    if (signedIn.value.mfaRequired || !signedIn.value.session) {
      setStage('mfa')
      return
    }
    onAuthenticated(signedIn.value.session)
  }

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await authApi.mfaVerify(username.trim(), code)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onAuthenticated(result.value.session)
  }

  const trackCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false)
  }

  return (
    <div className="signin-page">
      <TopBar area="admin" />
      <div className="signin">
        <OfficePanel elections={elections} />

        <main className="signin-main">
          <div className="signin-form-wrap">
            {stage === 'mfa' ? (
              <form className="signin-form" onSubmit={submitCode}>
                <p className="signin-step">Step 2 of 2</p>
                <h1>Enter your sign-in code</h1>
                <p className="signin-lede">
                  Open your authenticator app and enter the six-digit code for <strong>{username}</strong>. You can also
                  use one of your recovery codes.
                </p>

                {error && <Alert tone="error">{error}</Alert>}

                <div className="form-group">
                  <label htmlFor="admin-code">Code</label>
                  <input
                    id="admin-code"
                    className="otp-field"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="000000"
                    autoFocus
                    required
                  />
                </div>

                <button type="submit" className="btn-primary btn-block btn-lg" disabled={busy || code.length < 6}>
                  {busy ? 'Checking…' : 'Verify and sign in'}
                </button>

                <button
                  type="button"
                  className="signin-back"
                  onClick={() => {
                    setStage('password')
                    setCode('')
                    setError(null)
                  }}
                >
                  <Icon name="arrow-left" />
                  Use a different account
                </button>
              </form>
            ) : (
              <form className="signin-form" onSubmit={submitPassword}>
                {needsBootstrap && <p className="signin-step">First-time setup</p>}
                <h1>{needsBootstrap ? 'Create the first admin account' : 'Sign in'}</h1>
                <p className="signin-lede">
                  {needsBootstrap
                    ? 'This server has no admin accounts yet. The account you create now becomes the Super Admin and owns every election here.'
                    : 'Manage elections, voter lists and results.'}
                </p>

                {error && <Alert tone="error">{error}</Alert>}

                {needsBootstrap && (
                  <div className="form-group">
                    <label htmlFor="admin-display">Your name</label>
                    <input
                      id="admin-display"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Jordan Chen"
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="admin-username">Username</label>
                  <input
                    id="admin-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus={!needsBootstrap}
                    required
                    minLength={3}
                  />
                  {needsBootstrap && (
                    <p className="field-hint">3–40 characters: letters, numbers, dots, hyphens or underscores.</p>
                  )}
                </div>

                <div className="form-group">
                  <div className="signin-label-row">
                    <label htmlFor="admin-password">Password</label>
                    {!needsBootstrap && (
                      <button
                        type="button"
                        className="signin-help-toggle"
                        aria-expanded={helpOpen}
                        aria-controls="signin-help"
                        onClick={() => setHelpOpen((open) => !open)}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="signin-password">
                    <input
                      id="admin-password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyUp={trackCaps}
                      onKeyDown={trackCaps}
                      onBlur={() => setCapsLock(false)}
                      autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                      required
                      minLength={needsBootstrap ? 12 : 1}
                    />
                    <button
                      type="button"
                      className="signin-reveal"
                      onClick={() => setShowPassword((shown) => !shown)}
                      aria-pressed={showPassword}
                      aria-controls="admin-password"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {capsLock && <p className="field-hint signin-caps">Caps Lock is on.</p>}
                  {needsBootstrap && (
                    <p className="field-hint">
                      At least 12 characters, using three of: lower case, upper case, numbers, symbols.
                    </p>
                  )}
                  {helpOpen && (
                    <p className="signin-help" id="signin-help">
                      Passwords are reset by a Super Admin under <strong>Security → Accounts</strong>. Ask them to reset
                      yours, then sign in with the temporary password they give you.
                    </p>
                  )}
                </div>

                {mfaKnown && (
                  <p className="signin-note">
                    <Icon name="shield-check" />
                    This account uses two-step sign-in. You&rsquo;ll be asked for a code next.
                  </p>
                )}

                <button type="submit" className="btn-primary btn-block btn-lg" disabled={busy}>
                  {busy ? 'Signing in…' : needsBootstrap ? 'Create account and sign in' : 'Sign in'}
                </button>

                <p className="signin-foot">
                  {needsBootstrap
                    ? 'You can add more admins and assign their roles once you’re signed in.'
                    : 'Don’t have an account? A Super Admin can create one for you.'}
                </p>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * The election office: the product, and what this server is running right now.
 */
function OfficePanel({ elections }: { elections: ElectionSummary[] }) {
  const host = typeof window !== 'undefined' ? window.location.host : 'this server'
  const { open, upcoming, closed } = useMemo(() => {
    const listed = elections.filter((item) => item.effective_status !== 'archived')
    return {
      open: listed.filter((item) => item.effective_status === 'open' || item.effective_status === 'paused'),
      upcoming: listed.filter((item) => item.effective_status === 'scheduled' || item.effective_status === 'draft'),
      closed: listed.filter((item) => item.effective_status === 'closed' || item.effective_status === 'certified'),
    }
  }, [elections])

  return (
    <aside className="signin-side" aria-label="About this server">
      <div className="signin-side-body">
        <p className="signin-side-kicker">Admin console</p>
        <h2 className="signin-side-title">The election office.</h2>
        <p className="signin-side-lede">
          Set up ballots, manage voter lists, open and close voting, and certify the count.
        </p>

        <div className="signin-board">
          <p className="signin-board-title">On this server now</p>
          <dl className="signin-counts">
            <div>
              <dt>Open</dt>
              <dd>{open.length}</dd>
            </div>
            <div>
              <dt>Coming up</dt>
              <dd>{upcoming.length}</dd>
            </div>
            <div>
              <dt>Closed</dt>
              <dd>{closed.length}</dd>
            </div>
          </dl>
          {open.length > 0 && (
            <ul className="signin-live">
              {open.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <span className="signin-live-title">{item.title}</span>
                  <StatusBadge status={item.status} effective={item.effective_status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="signin-side-foot">
        <p className="signin-side-secure">
          <Icon name="lock" />
          Sign-in details never leave {host}.
        </p>
        <nav className="signin-side-links" aria-label="Legal and policy">
          <a href="#/legal">Legal notices</a>
          <a href="#/terms">Terms</a>
          <a href="#/privacy">Privacy</a>
        </nav>
      </div>
    </aside>
  )
}
