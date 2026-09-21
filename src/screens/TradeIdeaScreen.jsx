import { useCallback, useMemo, useState } from 'react';
import TradeIdeaForm from '../components/trade-idea/TradeIdeaForm.jsx';
import ThesisPreview from '../components/trade-idea/ThesisPreview.jsx';
import SubmissionResult from '../components/trade-idea/SubmissionResult.jsx';
import { submitTradeIdea } from '../lib/api.js';
import { EMPTY_FORM, validateIdeaForm, toSubmissionPayload } from '../lib/validation.js';

export default function TradeIdeaScreen({ initialForm, onSubmitted }) {
  const [form, setForm] = useState(initialForm ?? EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const clientErrors = useMemo(() => validateIdeaForm(form), [form]);
  const allErrors = useMemo(() => ({ ...clientErrors, ...serverErrors }), [clientErrors, serverErrors]);

  const visibleErrors = useMemo(() => {
    const output = {};
    for (const [field, message] of Object.entries(allErrors)) {
      if (submitAttempted || touched[field] || serverErrors[field]) output[field] = message;
    }
    return output;
  }, [allErrors, touched, submitAttempted, serverErrors]);

  const handleChange = useCallback((name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setTouched((previous) => ({ ...previous, [name]: true }));
    setServerErrors({});
  }, []);

  const handleReset = useCallback(() => {
    setForm(EMPTY_FORM);
    setTouched({});
    setSubmitAttempted(false);
    setServerErrors({});
    setResult(null);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setSubmitAttempted(true);
      setServerErrors({});

      const currentErrors = validateIdeaForm(form);
      if (Object.keys(currentErrors).length > 0) {
        setResult(null);
        const firstField = document.getElementById(Object.keys(currentErrors)[0]);
        if (firstField && typeof firstField.focus === 'function') firstField.focus();
        return;
      }

      setSubmitting(true);
      try {
        const response = await submitTradeIdea(toSubmissionPayload(form));
        if (response.ok) {
          // Phase 2: carry the captured context into the Investigation screen.
          onSubmitted({ ...response.data, offline: false }, form);
        } else if (response.kind === 'validation') {
          setServerErrors(response.errors);
          setResult({ kind: 'error', message: response.message, errors: response.errors });
        } else {
          setResult({ kind: 'error', message: response.message });
        }
      } catch {
        // Backend unreachable: still transition into Investigation with a locally
        // captured thesis, but state clearly that nothing was validated or
        // analysed server-side.
        onSubmitted(
          {
            receivedAt: new Date().toISOString(),
            idea: toSubmissionPayload(form),
            message:
              'Thesis captured in the browser only. The TradeGuard backend is not reachable, ' +
              'so nothing was validated or analysed server-side.',
            offline: true,
          },
          form
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form, onSubmitted]
  );

  const dismissResult = useCallback(() => {
    setResult(null);
    setSubmitAttempted(false);
    setServerErrors({});
  }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 1 — Trade Idea</div>
        <h1 className="page-head__title">What are you thinking?</h1>
        <p className="page-head__lede">
          Describe the trade you want to take. TradeGuard records your thesis first, then
          challenges it before you risk capital.
        </p>
      </div>

      <div className="idea-layout">
        <TradeIdeaForm
          form={form}
          errors={visibleErrors}
          submitting={submitting}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />

        {/* The right-hand workspace column. It is a class rather than an inline
            style because the workspace geometry (sticky anchoring, its own
            vertical overflow) has to be expressed in the stylesheet, and an
            inline `style` attribute would outrank every rule there. */}
        <div className="idea-layout__aside">
          {result && <SubmissionResult result={result} onDismiss={dismissResult} />}
          <ThesisPreview form={form} />
        </div>
      </div>
    </>
  );
}
