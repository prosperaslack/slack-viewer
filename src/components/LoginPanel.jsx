import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPanel({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const onSlackSignIn = async () => {
    setStatus('loading')
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'slack_oidc',
        options: {
          redirectTo: window.location.origin,
          scopes: 'openid profile email',
        },
      })
      if (error) {
        setStatus('error')
        setMessage(error.message || 'Slack sign-in failed')
      }
      // Browser redirects to Slack on success
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Slack sign-in failed')
    }
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const cleaned = email.trim().toLowerCase()
    if (!cleaned || !password) return

    setStatus('loading')
    setMessage('')

    try {
      const { data, error } = await supabase.functions.invoke('community-login', {
        body: { email: cleaned, password },
      })

      if (error) {
        setStatus('error')
        setMessage(error.message || 'Login failed')
        return
      }

      if (data?.error) {
        setStatus('error')
        setMessage(data.error)
        return
      }

      if (!data?.access_token || !data?.refresh_token) {
        setStatus('error')
        setMessage('Login failed: no session returned')
        return
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      if (sessionErr) {
        setStatus('error')
        setMessage(sessionErr.message)
        return
      }

      if (!sessionData?.session) {
        setStatus('error')
        setMessage('Login failed: session not established')
        return
      }

      // Push session into App immediately — don't wait for onAuthStateChange
      onSignedIn?.(sessionData.session)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Prospera</p>
        <h1>Slack archive</h1>
        <p className="login-copy">
          Sign in with Slack, or use your email and the community password.
        </p>

        <button
          type="button"
          className="slack-login-btn"
          onClick={onSlackSignIn}
          disabled={status === 'loading'}
        >
          Continue with Slack
        </button>

        <div className="login-divider" role="presentation">
          <span>or</span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={status === 'loading'}
          />

          <label htmlFor="password">Community password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Community password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={status === 'loading'}
          />

          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in with email'}
          </button>
        </form>

        {status === 'error' && <p className="login-error">{message}</p>}
      </div>
    </div>
  )
}
