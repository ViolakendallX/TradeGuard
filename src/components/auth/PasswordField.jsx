import { useState } from 'react';
import AuthField from './AuthField.jsx';

/**
 * A password field with a show/hide control.
 *
 * The control is a real button inside the input's wrapper, so it is reachable by
 * keyboard and announced by a screen reader. It is `type="button"` deliberately:
 * a bare button inside a form submits it, and "reveal what I typed" must never
 * be the same gesture as "sign me in".
 *
 * Revealing the password does not alter the value, and the value is never
 * trimmed, logged or stored — nothing here leaves the component.
 */
export default function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  meta,
  autoComplete,
  autoFocus = false,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthField
      id={id}
      name={name}
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      error={error}
      meta={meta}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      placeholder={placeholder}
      icon="lock"
      adornment={
        <button
          type="button"
          className="auth__reveal"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          data-auth-toggle-password={name}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
