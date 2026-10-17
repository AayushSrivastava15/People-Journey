import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, HeartHandshake, LockKeyhole } from 'lucide-react';

export function LoginPlaceholder() {
  useEffect(() => {
    document.title = 'Workspace access | People Journey';
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
      'content',
      'People Journey workspace access is not configured yet. Learn how to get access from your people operations team.',
    );
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute(
      'content',
      'Workspace access | People Journey',
    );
  }, []);
  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <a className="login-brand" href="/" aria-label="People Journey home">
        <span className="brand-lockup"><span className="brand-symbol" aria-hidden="true"><span /><span /><span /></span><span className="brand-name">people<span>journey</span></span></span>
      </a>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-icon"><LockKeyhole size={21} strokeWidth={1.6} /></div>
        <span className="eyebrow">A little more human, by design</span>
        <h1 className="display-font" id="login-title">Your workspace<br /><em>is on its way.</em></h1>
        <p>People Journey workspace access isn’t configured yet. When your people team is ready, they’ll share the right way to sign in.</p>
        <div className="login-status"><span className="status-dot" /> Workspace access is not available yet</div>
        <Link href="/" className="button button-primary login-return" data-testid="link-return-home"><ArrowLeft size={15} /> Back to People Journey</Link>
        <div className="login-help"><HeartHandshake size={15} /><span>Need a hand? Reach out to your people operations team.</span></div>
      </section>
      <div className="login-footer">A thoughtful workspace for every employee journey.</div>
    </main>
  );
}
