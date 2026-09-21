/**
 * One labelled auth field.
 *
 * Reuses the product's established form language — `.label`, `.input`,
 * `.has-error`, `.field__error` — so the auth screens look like the rest of
 * TradeGuard rather than like a bolted-on login page.
 *
 * The error is rendered only when the caller decides the field should show one
 * (i.e. it has been touched, or the form was submitted). The field itself never
 * guesses: validation lives in `src/lib/auth.js`.
 */

import Icon from '../Icon.jsx';

export default function AuthField({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  meta,
  required = true,
  autoComplete,
  placeholder,
  inputMode,
  autoFocus = false,
  adornment,
  icon,
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}{' '}
        {required ? (
          <span className="label__req">*</span>
        ) : (
          <span className="label__opt">optional</span>
        )}
      </label>

      <div className={`auth__control${adornment ? ' auth__control--adorned' : ''}`}>
        {/* The leading glyph is decorative: the label above already names the
            field, so announcing it twice would only add noise for a screen
            reader. It exists to make the control scannable at a glance. */}
        {icon && (
          <span className="auth__control-icon" aria-hidden="true">
            <Icon name={icon} size={17} />
          </span>
        )}

        <input
          id={id}
          name={name}
          type={type}
          className={`input${error ? ' has-error' : ''}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          data-auth-field={name}
        />
        {adornment}
      </div>

      {error ? (
        <div className="field__error" id={`${id}-error`} data-auth-error={name} role="alert">
          {error}
        </div>
      ) : (
        meta && <div className="field__meta">{meta}</div>
      )}
    </div>
  );
}
