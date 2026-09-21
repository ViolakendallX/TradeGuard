import { useMemo, useState } from 'react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import AuthField from '../components/auth/AuthField.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import AuthNotice from '../components/auth/AuthNotice.jsx';
import Logo from '../components/Logo.jsx';
import {
  AUTH_STATUS,
  CREATE_ACCOUNT_FIELDS,
  EMPTY_CREATE_ACCOUNT,
  PASSWORD_MIN_LENGTH,
  createAccount,
  isFilled,
  validateCreateAccountForm,
} from '../lib/auth.js';

const ID_PREFIX = 'signup';

/**
 * Create account.
 *
 * Mirrors the sign-in screen's states: empty, invalid email, password rules,
 * confirmation mismatch, loading, and a real outcome. A successful submit creates
 * the account on the server, which opens a session in the same response — so the
 * trader lands in the app rather than being sent back to sign in.
 *
 * The password is passed to the request and is not kept. Nothing about it is
 * stored in this component after the call returns.
 */
export default function CreateAccountScreen({ onNavigate, onAuthenticated }) {
  const [form, setForm] = useState(EMPTY_CREATE_ACCOUNT);
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState(AUTH_STATUS.IDLE);
  const [notice, setNotice] = useState(null);
  const [serverErrors, setServerErrors] = useState({});

  const errors = useMemo(() => validateCreateAccountForm(form), [form]);
  const errorFor = (field) => {
    if (serverErrors[field]) return serverErrors[field];
    return touched[field] ? errors[field] : undefined;
  };

  const loading = status === AUTH_STATUS.LOADING;
  const complete = isFilled(form, CREATE_ACCOUNT_FIELDS);

  const change = (name) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setNotice(null);
    setServerErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const blur = (name) => () => setTouched((current) => ({ ...current, [name]: true }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const found = validateCreateAccountForm(form);
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    if (Object.keys(found).length > 0) {
      setNotice({
        tone: 'error',
        title: 'Check the highlighted fields',
        message: 'Correct the fields marked below, then create your account.',
      });
      const first = CREATE_ACCOUNT_FIELDS.find((field) => found[field]);
      if (first) document.getElementById(`${ID_PREFIX}-${first}`)?.focus();
      return;
    }

    setNotice(null);
    setServerErrors({});
    setStatus(AUTH_STATUS.LOADING);

    const result = await createAccount({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
    });

    if (result.ok) {
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
      // A duplicate email is the one failure with an obvious next step, so it is
      // offered rather than left for the trader to work out.
      action:
        result.status === AUTH_STATUS.DUPLICATE
          ? { id: 'signin', label: 'Sign in instead', onClick: () => onNavigate('login') }
          : undefined,
    });

    const firstBad = CREATE_ACCOUNT_FIELDS.find((field) => result.errors?.[field]);
    if (firstBad) document.getElementById(`${ID_PREFIX}-${firstBad}`)?.focus();
  };

  return (
    <AuthLayout screen="create-account">
      <div className="auth__head">
        <div className="auth__eyebrow">New account</div>
        <Logo size="sm" />
        <h2 className="auth__title">Create your TradeGuard account</h2>
        <p className="auth__subtitle">
          One account holds your Trade Memory. Nothing else about this browser is shared with it.
        </p>
      </div>

      <AuthNotice notice={notice} />

      <form
        className="auth__form"
        onSubmit={handleSubmit}
        noValidate
        data-auth-form="create-account"
        data-auth-status={status}
      >
        <AuthField
          id={`${ID_PREFIX}-name`}
          name="name"
          label="Name"
          icon="user"
          value={form.name}
          onChange={change('name')}
          onBlur={blur('name')}
          error={errorFor('name')}
          autoComplete="name"
          placeholder="Alex Trader"
          autoFocus
        />

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
        />

        {/* The two password fields sit side by side, which is the one
            compositional difference from Sign in: it reads as a pair being
            checked against each other rather than as two more fields. */}
        <div className="auth__pair">
          <PasswordField
            id={`${ID_PREFIX}-password`}
            name="password"
            label="Password"
            value={form.password}
            onChange={change('password')}
            onBlur={blur('password')}
            error={errorFor('password')}
            autoComplete="new-password"
            meta={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          />

          <PasswordField
            id={`${ID_PREFIX}-confirmPassword`}
            name="confirmPassword"
            label="Confirm password"
            value={form.confirmPassword}
            onChange={change('confirmPassword')}
            onBlur={blur('confirmPassword')}
            error={errorFor('confirmPassword')}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          className="btn btn--primary auth__submit"
          disabled={!complete || loading}
          aria-busy={loading}
          data-auth-submit="create-account"
        >
          {loading ? (
            <>
              <span className="spinner" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>

        {!complete && !loading && (
          <div className="auth__empty" data-auth-empty>
            Fill in every field to create your account.
          </div>
        )}
      </form>

      <div className="divider" />

      <div className="auth__alt">
        <span>Already have an account?</span>
        <button
          type="button"
          className="btn btn--link"
          onClick={() => onNavigate('login')}
          data-auth-link="login"
        >
          Sign in
        </button>
      </div>

      <div className="auth__skip">
        <span className="auth__skip-text">
          Your password is stored only as a secure hash. TradeGuard never stores it, and cannot
          read it back to you.
        </span>
      </div>
    </AuthLayout>
  );
}
