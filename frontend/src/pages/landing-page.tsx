import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardCheck, Clock3, DoorOpen, HeartHandshake,
  Layers3, LockKeyhole, Menu, MessageCircle, RefreshCw, ShieldCheck, Sparkles,
  UsersRound, X,
} from 'lucide-react';

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#journey' },
  { label: 'About', href: '#about' },
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand-lockup ${light ? 'brand-lockup-light' : ''}`}>
      <span className="brand-symbol" aria-hidden="true"><span /><span /><span /></span>
      <span className="brand-name">people<span>journey</span></span>
    </span>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 18);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className={`site-header ${scrolled ? 'site-header-scrolled' : ''}`}>
      <div className="nav-inner">
        <a className="brand-link" href="#home" aria-label="People Journey home" onClick={closeMenu}>
          <BrandMark />
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map(item => <a className="nav-link" href={item.href} key={item.href}>{item.label}</a>)}
        </nav>
        <div className="nav-right">
          <span className="nav-note"><span className="status-dot" />Your people, thoughtfully managed.</span>
          <Link href="/login" className="nav-login" data-testid="link-hr-login">HR Login <ArrowUpRight size={14} /></Link>
        </div>
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(value => !value)}
          data-testid="button-mobile-menu"
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile navigation"
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {navItems.map(item => <a href={item.href} key={item.href} onClick={closeMenu}>{item.label}<ChevronRight size={16} /></a>)}
            <Link href="/login" onClick={closeMenu}>HR Login <ArrowUpRight size={15} /></Link>
            <p><span className="status-dot" />Your people, thoughtfully managed.</p>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Avatar({ initials, tone }: { initials: string; tone: string }) {
  return <span className={`avatar ${tone}`} aria-hidden="true">{initials}</span>;
}

function FloatingDashboardPreview() {
  return (
    <div className="hero-visual" aria-label="Illustrative People Journey product preview">
      <div className="hero-visual-orbit orbit-one" />
      <div className="hero-visual-orbit orbit-two" />
      <div className="floating-note note-left glass-surface">
        <span className="note-icon note-icon-peach"><Sparkles size={15} /></span>
        <span><strong>A new beginning</strong><small>Welcome plan is ready</small></span>
        <CheckCircle2 size={16} className="note-check" />
      </div>
      <div className="preview-window glass-surface">
        <div className="preview-topbar">
          <div className="preview-brand"><span className="tiny-brand-mark" /> People Journey <span className="demo-chip">SAMPLE</span></div>
          <div className="preview-top-actions"><span className="preview-date">Monday, 14 October</span><span className="mini-bell"><Bell size={14} /></span><Avatar initials="AR" tone="tone-lilac" /></div>
        </div>
        <div className="preview-body">
          <aside className="preview-sidebar" aria-hidden="true">
            <span className="side-active"><Layers3 size={14} /></span><span><UsersRound size={14} /></span><span><CalendarDays size={14} /></span><span><ClipboardCheck size={14} /></span>
            <span className="side-bottom"><CircleHelp size={14} /></span>
          </aside>
          <div className="preview-content">
            <div className="preview-heading-row"><div><small>YOUR WORKSPACE</small><h3>A thoughtful week ahead</h3></div><span className="preview-period">This week⌄</span></div>
            <div className="preview-metrics">
              <div><span className="metric-icon metric-blush"><UsersRound size={15} /></span><small>Joining soon</small><strong>04</strong><em>next 14 days</em></div>
              <div><span className="metric-icon metric-lilac"><Check size={15} /></span><small>In progress</small><strong>08</strong><em>journeys</em></div>
              <div><span className="metric-icon metric-peach"><Clock3 size={15} /></span><small>Needs a look</small><strong>03</strong><em>gentle reminders</em></div>
            </div>
            <div className="preview-lower">
              <div className="preview-people">
                <div className="panel-label"><strong>Coming up</strong><span>View all <ArrowUpRight size={11} /></span></div>
                <div className="person-row"><Avatar initials="MC" tone="tone-peach" /><span><strong>Maya Chen</strong><small>Product · Oct 16</small></span><b className="status-pill status-welcome">Welcome</b></div>
                <div className="person-row"><Avatar initials="JT" tone="tone-rose" /><span><strong>Jonah Tate</strong><small>People · Oct 18</small></span><b className="status-pill status-ready">Getting ready</b></div>
                <div className="person-row"><Avatar initials="AR" tone="tone-lilac" /><span><strong>Amara Reed</strong><small>Design · Oct 21</small></span><b className="status-pill status-plan">In progress</b></div>
              </div>
              <div className="preview-calendar">
                <div className="panel-label"><strong>October</strong><span>2025</span></div>
                <div className="calendar-grid calendar-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
                <div className="calendar-grid"><span className="faint">29</span><span className="faint">30</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span className="today">14</span><span className="marked">15</span><span>16</span><span>17</span><span className="marked peach-dot">18</span><span>19</span></div>
                <div className="calendar-key"><i /> Start date <i className="peach-key" /> Milestone</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="floating-note note-right glass-surface">
        <span className="note-icon note-icon-lilac"><CalendarDays size={15} /></span>
        <span><strong>Oct 16 · Maya joins</strong><small>Day-one journey</small></span>
      </div>
      <div className="visual-caption">A little more human, by design.</div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="hero-section" id="home">
      <div className="hero-backdrop">
        <div className="ambient-orb hero-orb hero-orb-1" /><div className="ambient-orb hero-orb hero-orb-2 delay" />
        <div className="hero-wash" />
      </div>
      <div className="hero-grid page-container">
        <div className="hero-copy">
          <Reveal>
            <div className="hero-eyebrow"><span className="eyebrow-spark"><Sparkles size={13} /></span> The people operations workspace</div>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="hero-title display-font">Every new beginning,<br /><em>beautifully managed.</em></h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="hero-description">From the first welcome to the final farewell, bring every employee journey together in one thoughtful, effortless workspace.</p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="hero-actions">
              <a href="#features" className="button button-primary button-lift" data-testid="link-explore-platform">Explore the platform <ArrowRight size={16} /></a>
              <Link href="/login" className="button button-secondary button-lift" data-testid="link-hero-login">HR Login <ArrowUpRight size={15} /></Link>
            </div>
          </Reveal>
          <Reveal delay={0.32}>
            <div className="hero-proof"><span className="proof-mark"><HeartHandshake size={16} /></span><span>One workspace.<br /><strong>Every employee journey.</strong></span><span className="proof-divider" /><small>Made for the moments<br />that make a workplace.</small></div>
          </Reveal>
        </div>
        <Reveal className="hero-preview-reveal" delay={0.15}><FloatingDashboardPreview /></Reveal>
      </div>
      <a className="scroll-cue" href="#features"><span>Scroll to explore</span><ArrowDown size={14} /></a>
    </section>
  );
}

const featureItems = [
  { id: 'onboarding', number: '01', title: 'A welcome that feels like one.', description: 'Bring the details together before day one, so a new teammate can focus on the best part: getting started.', icon: DoorOpen, tint: 'feature-peach', tag: 'ONBOARDING', details: ['Employee and joining-date records', 'Department and manager context', 'Configurable welcome milestones'] },
  { id: 'offboarding', number: '02', title: 'A thoughtful next chapter.', description: 'Keep every final detail in view and give people a clear, considered close to their time with you.', icon: HeartHandshake, tint: 'feature-rose', tag: 'OFFBOARDING', details: ['Last-day and exit workflow tracking', 'Personal and work contact records', 'Clear transition status'] },
  { id: 'notifications', number: '03', title: 'The right nudge, at the right time.', description: 'Plan day-zero, day-seven, and day-thirty touchpoints that help no important moment slip by.', icon: Bell, tint: 'feature-lilac', tag: 'SCHEDULED TOUCHPOINTS', details: ['Configurable journey milestones', 'A visible notification history', 'Retry-ready workflow design'] },
  { id: 'interviews', number: '04', title: 'Make space to reflect.', description: 'Invite people to share what their experience was really like, with a simple and structured exit interview flow.', icon: MessageCircle, tint: 'feature-butter', tag: 'EXIT INTERVIEWS', details: ['Unique, time-limited interview links', 'Structured response collection', 'Submission status at a glance'] },
];

function FeaturesSection() {
  return (
    <section className="features-section section-space" id="features">
      <div className="page-container">
        <div className="section-heading features-heading">
          <Reveal><span className="eyebrow">One workspace, all the moments</span></Reveal>
          <Reveal delay={.06}><h2 className="display-font">Everything your people<br className="desktop-break" /> journey <em>needs.</em></h2></Reveal>
          <Reveal delay={.12}><p>One connected workflow for welcoming people, supporting transitions, and closing every chapter with care.</p></Reveal>
        </div>
        <div className="feature-layout">
          {featureItems.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.id} delay={index * .06} className={`feature-reveal feature-slot-${index + 1}`}>
                <article className={`feature-card ${feature.tint}`}>
                  <div className="feature-card-top"><span className="feature-icon"><Icon size={20} strokeWidth={1.7} /></span><span className="feature-number">{feature.number}</span></div>
                  <span className="feature-tag">{feature.tag}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ul>{feature.details.map(detail => <li key={detail}><Check size={14} />{detail}</li>)}</ul>
                  <span className="feature-card-ornament" aria-hidden="true" />
                </article>
              </Reveal>
            );
          })}
          <Reveal className="feature-note" delay={.14}>
            <div className="feature-note-inner"><span className="eyebrow">Designed around people</span><p>Less chasing small details. More room for the conversations that matter.</p><a href="#about">Why it matters <ArrowRight size={14} /></a></div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const journeyStages = [
  { number: '01', title: 'Welcome', text: 'A new teammate joins. Their details and first-day plan have a home.', icon: Sparkles, chip: 'Before day one' },
  { number: '02', title: 'Settle in', text: 'Thoughtful check-ins can be planned around the milestones you choose.', icon: HeartHandshake, chip: 'Day 0 · 7 · 30' },
  { number: '03', title: 'Transition', text: 'When a chapter changes, keep the last working day and next steps clear.', icon: RefreshCw, chip: 'When plans change' },
  { number: '04', title: 'Reflect', text: 'Offer a private-feeling moment to share feedback and close the loop.', icon: MessageCircle, chip: 'A considered close' },
];

function JourneySection() {
  return (
    <section className="journey-section section-space" id="journey">
      <div className="page-container">
        <div className="journey-intro">
          <Reveal><span className="eyebrow">A journey, not a checklist</span></Reveal>
          <Reveal delay={.07}><h2 className="display-font">From day one to<br /><em>the next chapter.</em></h2></Reveal>
          <Reveal delay={.14}><p>Good transitions are made of small, well-timed moments. Shape the flow around the way your team works.</p></Reveal>
          <Reveal delay={.2}><div className="configurable-note"><span><Check size={13} /></span> Configurable workflows, shaped by your team</div></Reveal>
        </div>
        <div className="timeline-wrap">
          <div className="timeline-track" aria-hidden="true"><span className="timeline-progress" /></div>
          <div className="timeline-grid">
            {journeyStages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <Reveal key={stage.number} delay={index * .1} className="timeline-stage">
                  <div className={`timeline-node node-${index + 1}`}><Icon size={18} strokeWidth={1.7} /></div>
                  <span className="timeline-number">STEP {stage.number}</span>
                  <h3>{stage.title}</h3>
                  <p>{stage.text}</p>
                  <span className="timeline-chip">{stage.chip}</span>
                </Reveal>
              );
            })}
          </div>
          <p className="timeline-footnote"><Clock3 size={13} /> Timing and communication are configurable. This preview does not send email.</p>
        </div>
      </div>
    </section>
  );
}

function MiniBarChart() {
  const bars = [42, 57, 49, 76, 61, 88, 69, 94, 72, 82, 62, 78];
  return (
    <div className="mini-chart" role="img" aria-label="Illustrative employee journey activity over twelve weeks">
      <div className="chart-bars">{bars.map((height, i) => <span key={i} className={i === 7 ? 'bar bar-highlight' : 'bar'} style={{ height: `${height}%` }} />)}</div>
      <div className="chart-labels"><span>12 weeks ago</span><span>This week</span></div>
    </div>
  );
}

function ProductPreviewSection() {
  return (
    <section className="product-section section-space" id="preview">
      <div className="page-container">
        <div className="product-heading">
          <Reveal><span className="eyebrow">A calmer view of the work</span></Reveal>
          <Reveal delay={.06}><h2 className="display-font">See the whole journey.<br /><em>Keep the details close.</em></h2></Reveal>
          <Reveal delay={.12}><p>A considered home for the moving pieces, so your team can spend less time piecing them together.</p></Reveal>
        </div>
        <Reveal className="product-window-reveal" delay={.12}>
          <div className="product-showcase">
            <div className="showcase-aura" />
            <div className="product-window">
              <div className="product-window-bar"><div className="window-dots"><i /><i /><i /></div><span>People Journey <b>FICTIONAL PREVIEW</b></span><div className="window-profile">PJ</div></div>
              <div className="product-app">
                <aside className="app-sidebar">
                  <div className="app-logo"><span className="tiny-brand-mark" /> <b>people journey</b></div>
                  <small>WORKSPACE</small>
                  <span className="app-nav-active"><Layers3 size={15} /> Overview</span>
                  <span><UsersRound size={15} /> People</span>
                  <span><CalendarDays size={15} /> Journeys</span>
                  <span><Bell size={15} /> Notifications <i className="nav-counter">3</i></span>
                  <span><MessageCircle size={15} /> Exit interviews</span>
                  <div className="sidebar-lower"><small>YOUR TEAM</small><div className="team-member"><Avatar initials="AR" tone="tone-lilac" /><span>Alex Rivera<small>HR manager</small></span></div></div>
                </aside>
                <div className="app-main">
                  <div className="app-top"><div><small>MONDAY, OCTOBER 14, 2025</small><h3>Good morning, Alex <Sparkles size={16} /></h3><p>Here’s what’s moving across your people journeys.</p></div><span className="preview-filter">This month <ChevronRight size={13} /></span></div>
                  <div className="stat-grid">
                    <div className="stat-card"><span className="stat-icon stat-icon-rose"><UsersRound size={15} /></span><small>Total people</small><strong>128</strong><em><span>+6</span> this quarter</em></div>
                    <div className="stat-card"><span className="stat-icon stat-icon-peach"><Sparkles size={15} /></span><small>Joining this month</small><strong>08</strong><em>across 4 teams</em></div>
                    <div className="stat-card"><span className="stat-icon stat-icon-lilac"><DoorOpen size={15} /></span><small>Upcoming exits</small><strong>02</strong><em>next 30 days</em></div>
                    <div className="stat-card"><span className="stat-icon stat-icon-butter"><Bell size={15} /></span><small>To review</small><strong>03</strong><em>notification items</em></div>
                  </div>
                  <div className="app-content-grid">
                    <div className="app-panel activity-panel">
                      <div className="app-panel-head"><div><strong>Journey activity</strong><small>Milestones across your team</small></div><span className="period-pill">Last 12 weeks⌄</span></div>
                      <MiniBarChart />
                      <div className="chart-legend"><i /> Onboarding <i className="legend-lilac" /> Offboarding</div>
                    </div>
                    <div className="app-panel status-panel">
                      <div className="app-panel-head"><div><strong>Journey status</strong><small>Across all active plans</small></div><ArrowUpRight size={14} /></div>
                      <div className="status-summary"><div className="donut-chart"><span><b>14</b><small>active</small></span></div><div className="status-legend"><span><i className="legend-rose" /> Onboarding <b>09</b></span><span><i className="legend-lilac" /> Offboarding <b>05</b></span></div></div>
                    </div>
                  </div>
                  <div className="app-panel table-panel">
                    <div className="app-panel-head"><div><strong>Recent activity</strong><small>A clear trail of the little things</small></div><a href="#journey">See all <ArrowRight size={12} /></a></div>
                    <div className="activity-table">
                      <div className="table-row table-head"><span>PERSON</span><span>JOURNEY</span><span>RECENT UPDATE</span><span>STATUS</span></div>
                      <div className="table-row"><span className="table-person"><Avatar initials="MC" tone="tone-peach" /> Maya Chen</span><span>Onboarding</span><span>Welcome plan prepared</span><b className="table-status status-welcome">Getting ready</b></div>
                      <div className="table-row"><span className="table-person"><Avatar initials="JT" tone="tone-rose" /> Jonah Tate</span><span>Onboarding</span><span>Manager details added</span><b className="table-status status-ready">In progress</b></div>
                      <div className="table-row"><span className="table-person"><Avatar initials="SL" tone="tone-lilac" /> Sam Lee</span><span>Offboarding</span><span>Exit conversation invited</span><b className="table-status status-plan">Needs review</b></div>
                    </div>
                  </div>
                  <div className="app-panel table-panel notification-history-panel">
                    <div className="app-panel-head"><div><strong>Notification history</strong><small>Fictional preview · planned workflow activity</small></div><span className="history-label">SAMPLE DATA</span></div>
                    <div className="activity-table notification-table">
                      <div className="table-row table-head"><span>EVENT</span><span>RECIPIENT</span><span>DATE</span><span>DELIVERY STATUS</span></div>
                      <div className="table-row"><span>Day-one welcome</span><span>Maya Chen</span><span>Oct 16</span><b className="table-status status-welcome">Scheduled</b></div>
                      <div className="table-row"><span>Week-one check-in</span><span>Jonah Tate</span><span>Oct 25</span><b className="table-status status-ready">Queued</b></div>
                      <div className="table-row"><span>Exit interview invite</span><span>Sam Lee</span><span>Oct 28</span><b className="table-status status-plan">Draft</b></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="fictional-note"><span><LockKeyhole size={13} /></span> Fictional sample data for demonstration only. This preview is not connected to a live workspace.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="about-section section-space" id="about">
      <div className="page-container about-grid">
        <div className="about-copy">
          <Reveal><span className="eyebrow">The feeling behind the workflow</span></Reveal>
          <Reveal delay={.07}><h2 className="display-font">Less chasing.<br /><em>More caring.</em></h2></Reveal>
          <Reveal delay={.14}><p className="about-lead">A spreadsheet can hold a date. A thoughtful workspace helps you remember what that date means to someone.</p></Reveal>
          <Reveal delay={.2}><p className="about-body">People Journey brings the details, handoffs, and planned touchpoints of an employee transition into one shared view — helping people teams show up with consistency without losing the human part.</p></Reveal>
          <Reveal delay={.25}><a href="#journey" className="text-link">See how a journey flows <ArrowRight size={15} /></a></Reveal>
        </div>
        <Reveal className="about-visual" delay={.12}>
          <div className="about-quote-card">
            <div className="quote-mark">“</div>
            <p>The best transitions don’t feel like a process. They feel like someone remembered.</p>
            <div className="quote-footer"><span className="quote-avatar"><HeartHandshake size={17} /></span><span><strong>A people-first point of view</strong><small>Built for the moments in between</small></span></div>
            <span className="quote-decoration" aria-hidden="true" />
          </div>
          <div className="about-sticker"><span>care</span><HeartHandshake size={16} /></div>
        </Reveal>
      </div>
    </section>
  );
}

const privacyPoints = [
  { title: 'Access with intention', text: 'Workspace access is meant for the people who need it.', icon: LockKeyhole },
  { title: 'Details in the right hands', text: 'Keep employee records within a clear, controlled workspace.', icon: ShieldCheck },
  { title: 'Dates that keep their meaning', text: 'Make upcoming milestones and planned touchpoints easier to see.', icon: CalendarDays },
  { title: 'A trail you can follow', text: 'Keep a visible history of workflow activity and notification status.', icon: ClipboardCheck },
  { title: 'Links with a short life', text: 'Exit interview invitations can be designed to expire.', icon: Clock3 },
];

function PrivacySection() {
  return (
    <section className="privacy-section section-space" id="privacy">
      <div className="page-container privacy-layout">
        <div className="privacy-intro">
          <Reveal><span className="eyebrow">Thoughtful by default</span></Reveal>
          <Reveal delay={.07}><h2 className="display-font">Care includes<br /><em>how details are held.</em></h2></Reveal>
          <Reveal delay={.14}><p>Employee transitions involve personal information. A good workflow treats that responsibility with care and clarity.</p></Reveal>
          <Reveal delay={.19}><span className="privacy-caveat"><ShieldCheck size={15} /> Built with thoughtful boundaries in mind</span></Reveal>
        </div>
        <div className="privacy-list">
          {privacyPoints.map((item, index) => {
            const Icon = item.icon;
            return <Reveal key={item.title} delay={index * .05}><div className="privacy-item"><span className="privacy-icon"><Icon size={17} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><Check size={15} className="privacy-check" /></div></Reveal>;
          })}
          <p className="privacy-disclaimer">Workspace access and privacy features depend on implementation and configuration. No security certification or production guarantee is implied here.</p>
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="final-cta-section" id="get-started">
      <div className="page-container">
        <Reveal>
          <div className="final-cta">
            <span className="cta-orb cta-orb-one" /><span className="cta-orb cta-orb-two" />
            <div className="cta-content">
              <span className="eyebrow">A better way to move forward</span>
              <h2 className="display-font">Make every employee<br /> transition feel <em>effortless.</em></h2>
              <p>Bring your onboarding, offboarding, and scheduled communication into one thoughtful workspace.</p>
              <Link href="/login" className="button button-dark button-lift" data-testid="link-enter-workspace">Enter the HR workspace <ArrowRight size={16} /></Link>
              <small>Workspace access is not configured yet.</small>
            </div>
            <div className="cta-art" aria-hidden="true"><div className="cta-ring ring-one" /><div className="cta-ring ring-two" /><div className="cta-art-center"><HeartHandshake size={38} strokeWidth={1.2} /></div><Sparkles className="cta-star star-a" size={19} /><Sparkles className="cta-star star-b" size={14} /></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-container footer-main">
        <div className="footer-brand"><a href="#home" aria-label="People Journey home"><BrandMark /></a><p>A more thoughtful home for<br />every employee transition.</p></div>
        <div className="footer-col"><span>EXPLORE</span><a href="#home">Home</a><a href="#features">Features</a><a href="#journey">How it works</a><a href="#about">About</a></div>
        <div className="footer-col"><span>WORKSPACE</span><Link href="/login">HR Login <ArrowUpRight size={12} /></Link><a href="#privacy">Privacy approach</a><a href="#preview">Product preview</a></div>
        <div className="footer-signoff"><span className="footer-heart"><HeartHandshake size={17} /></span><p>People first.<br /><em>Always in the details.</em></p></div>
      </div>
      <div className="page-container footer-bottom"><span>© {new Date().getFullYear()} People Journey</span><span>Made for the moments that make a workplace.</span><a href="#home">Back to top <ArrowUpRight size={13} /></a></div>
    </footer>
  );
}

export function LandingPage() {
  useEffect(() => {
    document.title = 'People Journey | Thoughtful employee onboarding & offboarding';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    description?.setAttribute('content', 'Bring employee onboarding, offboarding, and planned touchpoints together in one thoughtful workspace built around people.');
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    ogTitle?.setAttribute('content', 'People Journey — every transition, thoughtfully managed');
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    ogDescription?.setAttribute('content', 'A thoughtful workspace for the moments that make a workplace.');
  }, []);
  return (
    <div className="page-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <JourneySection />
        <ProductPreviewSection />
        <AboutSection />
        <PrivacySection />
        <FinalCTASection />
      </main>
      <Footer />
    </div>
  );
}
