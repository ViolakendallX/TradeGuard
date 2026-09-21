/**
 * The form-level message area.
 *
 * This is where a whole-form outcome appears: the summary after a rejected submit,
 * the refusal the server sent back, and the honest answer to "Forgot password?".
 *
 * It is announced politely for an informational result and assertively for an
 * error, because one of those the trader is waiting on and the other they are not.
 *
 * It carries no "continue anyway" link: a form that offers a way past itself is a
 * form that is not really gating anything.
 */
export default function AuthNotice({ notice }) {
  if (!notice) return null;

  const isError = notice.tone === 'error';

  return (
    <div
      className={`auth__notice auth__notice--${isError ? 'error' : 'info'}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-auth-notice={isError ? 'error' : 'info'}
    >
      {notice.title && <div className="auth__notice-title">{notice.title}</div>}
      {notice.message && <div className="auth__notice-text">{notice.message}</div>}
      {notice.action && (
        <button
          type="button"
          className="btn btn--ghost auth__notice-action"
          onClick={notice.action.onClick}
          data-auth-notice-action={notice.action.id}
        >
          {notice.action.label}
        </button>
      )}
    </div>
  );
}
