"use client";

import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export default function OAuthConsentPage() {
  return <Suspense fallback={<main className="loading-screen"><p>Checking the request…</p></main>}><OAuthConsent /></Suspense>;
}

function OAuthConsent() {
  const supabase = getSupabaseBrowserClient();
  const authorizationId = useSearchParams().get("authorization_id");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !authorizationId) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setBusy(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [authorizationId, supabase]);

  useEffect(() => {
    if (!signedIn || !supabase || !authorizationId) return;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: detailsError }) => {
      if (detailsError) setError(detailsError.message);
      else if (data && "redirect_url" in data) window.location.assign(data.redirect_url);
      else if (data) setDetails(data);
      setBusy(false);
    });
  }, [authorizationId, signedIn, supabase]);

  const configurationError = !supabase || !authorizationId
    ? "This authorization request is incomplete or Supabase is not configured."
    : null;
  const visibleError = error ?? configurationError;
  const waitingForDetails = busy || (signedIn && !details && !visibleError);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  async function decide(approved: boolean) {
    if (!supabase || !authorizationId) return;
    setBusy(true);
    setError(null);
    const result = approved
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    window.location.assign(result.data.redirect_url);
  }

  return (
    <main className="consent-shell">
      <section className="consent-card">
        <div className="chatgpt-mark">✦</div>
        <p className="eyebrow">Private connection</p>
        <h1>Allow ChatGPT to read her records?</h1>
        {waitingForDetails ? <p>Checking the request…</p> : null}
        {visibleError ? <div className="form-error" role="alert">{visibleError}</div> : null}

        {!busy && !signedIn && !visibleError ? (
          <form className="login-form consent-login" onSubmit={signIn}>
            <p>Sign in first to approve this connection.</p>
            <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="primary-button" type="submit">Sign in</button>
          </form>
        ) : null}

        {!busy && details ? (
          <>
            <div className="requesting-app"><span>Requesting app</span><strong>{details.client.name || "ChatGPT"}</strong></div>
            <ul className="permission-list">
              <li><span>✓</span> Read the baby profile</li>
              <li><span>✓</span> Read feeding and diaper records</li>
              <li><span>✓</span> Read height and weight history</li>
              <li className="denied"><span>×</span> Cannot add, edit, or delete records</li>
            </ul>
            <p className="consent-note">Only approve this if you started the connection from ChatGPT. You can revoke it later in Supabase.</p>
            <div className="consent-actions">
              <button className="secondary-button" type="button" onClick={() => void decide(false)}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => void decide(true)}>Allow read access</button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
