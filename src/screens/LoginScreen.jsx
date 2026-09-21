import { useMemo, useState } from 'react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import AuthField from '../components/auth/AuthField.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import AuthNotice from '../components/auth/AuthNotice.jsx';
import Logo from '../components/Logo.jsx';
import {
  AUTH_STATUS,
  EMPTY_SIGN_IN,
  SIGN_IN_FIELDS,
  isFilled,
  requestPasswordReset,
  signIn,
  validateSignInForm,
} from '../lib/auth.js';

const ID_PREFIX = 'signin';

/**
 * Sign in.
 *
 * The form validates locally, then asks the server. Every outcome it can show
 * comes from that answer: success hands the signed-in user up so the app can open,
 * and a refusal is reported as what it is. There is no branch that produces a
 * session on its own.
 *
 * `serverErrors` is the one piece of state that is not derived: a field error the
 * server returned has no local cause to be recomputed from, so it is held until
 * the trader edits the field it belongs to.
 */
export default function LoginScreen({ onNavigate, onAuthenticated }) {
  const [form, setForm] = useState(EMPTY_SIGN_IN);
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState(AUTH_STATUS.IDLE);
  const [notice, setNotice] = useState(null);
  const [serverErrors, setServerErrors] = useState({});

  // Local errors are derived from the form, never stored — so a field the trader
  // is fixing stops being wrong the moment it is right, with no stale message.
  const errors = useMemo(() => validateSignInForm(form), [form]);
  const errorFor = (field) => {
    if (serverErrors[field]) return serverErrors[field];
    return touched[field] ? errors[field] : undefined;
  };

  const loading = status === AUTH_STATUS.LOADING;
  const complete = isFilled(form, SIGN_IN_FIELDS);

  const change = (name) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // Editing invalidates the previous outcome — and the server's complaint about
    // this field, which may no longer be true.
    setNotice(null);
    setServerErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const blur = (name) => () => setTouched((current) => ({ ...current, [name]: true }));

  const handleForgot = async () => {
    const result = await requestPasswordReset({ email: form.email.trim() });
    setNotice({ tone: 'info', title: result.title, message: result.message });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const found = validateSignInForm(form);
    setTouched({ email: true, password: true });

    if (Object.keys(found).length > 0) {
      setNotice({
        tone: 'error',
        title: 'Check the highlighted fields',
        message: 'Correct the fields marked below, then sign in again.',
      });
      const first = SIGN_IN_FIELDS.find((field) => found[field]);
      if (first) document.getElementById(`${ID_PREFIX}-${first}`)?.focus();
      return;
    }

    setNotice(null);
    setServerErrors({});
    setStatus(AUTH_STATUS.LOADING);

    const result = await signIn({ email: form.email.trim(), password: form.password });

    if (result.ok) {
      // The password is not kept, and neither is the form: the screen is about to
      // be replaced by the app.
      setStatus(AUTH_STATUS.SUCCESS);
      onAuthenticated?.(result.user);
      return;
    }

    setStatus(result.status);
    setServerErrors(result.errors || {});
    setNotice({
      tone: 'error',
      title: result.title,
      message: result.message,
      // Offered only when the server said the credentials were wrong — the one
      // case where the trader genuinely may not remember their password.
      action:
        result.status === AUTH_STATUS.REJECTED
          ? { id: 'forgot', label: 'Forgot password?', onClick: handleForgot }
          : undefined,
    });

    const firstBad = SIGN_IN_FIELDS.find((field) => result.errors?.[field]);
    if (firstBad) document.getElementById(`${ID_PREFIX}-${firstBad}`)?.focus();
  };

  return (
    <AuthLayout screen="login">
      <div className="auth__head">
        <Logo size="sm" />
        <h2 className="auth__title">Welcome back</h2>
        <p className="auth__subtitle">Sign in to your trading decision desk.</p>
      </div>

      <AuthNotice notice={notice} />

      <form
        className="auth__form"
        onSubmit={handleSubmit}
        noValidate
        data-auth-form="login"
        data-auth-status={status}
      >
        <AuthField
          id={`${ID_PREFIX}-email`}
          name="email"
          label="Email address"
          type="email"
          icon="mail"
          value={form.email}
          onChange={change('email')}
          onBlur={blur('email')}
          error={errorFor('email')}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          autoFocus
        />

        <PasswordField
          id={`${ID_PREFIX}-password`}
          name="password"
          label="Password"
          value={form.password}
          onChange={change('password')}
          onBlur={blur('password')}
          error={errorFor('password')}
          autoComplete="current-password"
        />

        <div className="auth__row">
          <button type="button" className="btn btn--link" onClick={handleForgot} data-auth-forgot>
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          className="btn btn--primary auth__submit"
          disabled={!complete || loading}
          aria-busy={loading}
          data-auth-submit="login"
        >
          {loading ? (
            <>
              <span className="spinner" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>

        {!complete && !loading && (
          <div className="auth__empty" data-auth-empty>
            Enter your email and password to continue.
          </div>
        )}
      </form>

      <div className="divider" />

      <div className="auth__alt">
        <span>Don’t have an account?</span>
        <button
          type="button"
          className="btn btn--link"
          onClick={() => onNavigate('create-account')}
          data-auth-link="create-account"
        >
          Create account
        </button>
      </div>

      {/* There is no "continue without signing in" any more. Trade Memory belongs
          to an account, so the app behind this screen needs to know whose it is. */}
      <div className="auth__skip">
        <span className="auth__skip-text">
          Trade Memory is saved against your account. Sign in to see the trades you have recorded.
        </span>
      </div>
    </AuthLayout>
  );
}
