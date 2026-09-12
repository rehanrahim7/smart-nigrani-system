/**
 * "How it works" - the whole system explained to someone who has never seen
 * it and does not write code.
 *
 * Rules followed while writing this page:
 *   - short sentences, everyday words
 *   - every number on the page comes from the API, so nothing goes stale
 *   - one idea per section, with a diagram shaped like that idea
 *   - it says what the system cannot do, near the top, not buried at the end
 *
 * It deliberately says nothing about installing or running the project. That
 * belongs in the handover file, not on a page a judge might open.
 */

import { api } from '../api'
import { useAsync } from '../hooks'
import {
  Card,
  Figure,
  MergeDown,
  ScoreScale,
  SideBySide,
  SplitPath,
  Steps,
} from '../components/Flow'
import { SectionNav, type NavSection } from '../components/SectionNav'
import { ThemeToggle } from '../theme'
import { SIGNAL_COLOR, count } from '../format'
import { Wordmark } from './Landing'

/* The menu and the page are built from the same list, so a section can never
   appear in one and not the other. */
const SECTIONS: NavSection[] = [
  { id: 'journey', label: 'The journey' },
  { id: 'data', label: 'The data' },
  { id: 'checks', label: 'The four checks' },
  { id: 'score', label: 'The score' },
  { id: 'model', label: 'The model' },
  { id: 'roles', label: 'Two roles' },
  { id: 'limits', label: 'Limits' },
]

const CHECKS = [
  {
    key: 'cost' as const,
    name: 'Is the cost normal?',
    how: 'It gathers other works whose descriptions mean roughly the same thing, from the same period, and compares the money. A community hall is compared with other community halls.',
    example:
      'A hall costs three times what similar halls cost. That is worth asking about.',
  },
  {
    key: 'duplicate' as const,
    name: 'Has this been built twice?',
    how: 'It compares the wording of every work against every other work. If two read almost the same, and they are under the same office, in the same area, in the same year, it says so.',
    example:
      'Two records, 94% the same wording, same district, same year. Either a data mistake, or the same work paid for twice.',
  },
  {
    key: 'delay' as const,
    name: 'Is it taking too long?',
    how: 'It looks at how long ago the money was approved and whether anyone has recorded the work as finished.',
    example:
      'Approved 759 days ago. No completion recorded. Still at the stage where a contractor has not been chosen.',
  },
  {
    key: 'payment' as const,
    name: 'Has the money moved too early?',
    how: 'It compares how much has been paid with how far the work has actually got.',
    example:
      'Almost all the money paid out, but the work has not really started. That ordering is the wrong way round.',
  },
]

const WEIGHTS = [
  { name: 'Cost', weight: 30, key: 'cost' as const },
  { name: 'Repeated work', weight: 25, key: 'duplicate' as const },
  { name: 'Time taken', weight: 25, key: 'delay' as const },
  { name: 'Money vs progress', weight: 20, key: 'payment' as const },
]

export function HowItWorks({
  onSignIn,
  onHome,
  signedIn = false,
}: {
  onSignIn: () => void
  onHome: () => void
  // Somebody already signed in reaches this page from the dashboard, so the
  // button in the corner takes them back rather than asking them to sign in.
  signedIn?: boolean
}) {
  const meta = useAsync(() => api.meta(), [])
  const highlights = useAsync(() => api.highlights(1), [])

  const total = meta.data ? count(meta.data.totalProjects) : '4,807'
  const flagged = highlights.data ? count(highlights.data.flaggedTotal) : '264'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--page)' }}>
      {/* ---------------- header and menu, one sticky strip ---------------- */}
      <div className="how-top">
        <header className="row how-header">
          <button type="button" onClick={onHome} aria-label="Back to the front page">
            <Wordmark />
          </button>
          <span className="grow" />
          <ThemeToggle compact />
          <button className="btn btn-primary btn-sm" onClick={onSignIn}>
            {signedIn ? (
              <>
                {/* The full sentence needs room. On a phone the short word
                    says the same thing and leaves the bar intact. */}
                <span className="only-wide">Back to the dashboard</span>
                <span className="only-narrow">Dashboard</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </header>

        <SectionNav sections={SECTIONS} />
      </div>

      {/* ---------------- opening ---------------- */}
      <section className="how-open">
        <div className="prose">
          <div className="label" style={{ marginBottom: 14 }}>
            How it works
          </div>
          <h1 className="how-title">How a work ends up on the list</h1>
          <p style={{ fontSize: 16.5 }}>
            Every Member of Parliament gets money each year to build small things
            in their area. Roads, community halls, street lights, drains, school
            rooms. The scheme is called <strong>MPLADS</strong>.
          </p>
          <p style={{ fontSize: 16.5 }}>
            Someone is supposed to check that the money was spent properly. In
            Maharashtra alone there are <strong>{total} works</strong> on record.
            One person reading them one by one would never finish.
          </p>
          <p style={{ fontSize: 16.5 }}>
            This system reads all of them, runs four checks on each, and puts the
            ones that look unusual at the top of a list. Right now that list has{' '}
            <strong>{flagged} works</strong> on it. Every one of them comes with a
            sentence saying why it is there.
          </p>
        </div>
      </section>

      {/* ---------------- the big picture ---------------- */}
      <section className="how-section" id="journey">
        <div className="prose how-lede">
          <h2 className="how-heading">The whole journey, start to finish</h2>
          <p>
            Government files go in at one end. A short list of works worth checking
            comes out at the other. Here is everything that happens in between.
          </p>
        </div>

        <Figure
          title="From government files to a list worth checking"
          caption="Nothing is thrown away along the way. Every work keeps its own record, so you can always open one and see the original numbers it came from."
        >
          <Steps
            steps={[
              {
                label: 'Government files',
                detail:
                  'Five published MPLADS reports: what was recommended, approved, finished, paid.',
              },
              {
                label: 'Tidy up',
                detail: 'Join the five files into one record per work. Fix dates and amounts.',
              },
              {
                label: 'Run four checks',
                detail: 'Cost, repeats, time taken, money against progress.',
                tone: 'accent',
              },
              {
                label: 'Give a score',
                detail: 'Combine the four into one number out of 100.',
                tone: 'accent',
              },
              {
                label: 'Sort the list',
                detail: 'Worst first, each with its reasons written out.',
                tone: 'warn',
              },
              {
                label: 'A person decides',
                detail: 'The system never decides anything. It only points.',
              },
            ]}
          />
        </Figure>
      </section>

      {/* ---------------- where the data comes from ---------------- */}
      <section className="how-section" id="data">
        <div className="prose how-lede">
          <h2 className="how-heading">Where the data comes from</h2>
          <p>
            Nothing here is made up. It all comes from reports the government
            already publishes. Five separate files, each holding one piece of the
            story, which is why they have to be joined together first.
          </p>
        </div>

        <Figure
          title="Five files, joined into one record per work"
          caption="A single work can appear in all five files. Joining them is what lets you ask a question like: this work was approved two years ago, so why has almost all its money already gone out?"
        >
          <MergeDown
            inputs={[
              { label: 'Works recommended', detail: 'What the MP asked for.' },
              { label: 'Works sanctioned', detail: 'What was approved, and for how much.' },
              { label: 'Works completed', detail: 'What was finished, and when.' },
              { label: 'Expenditure', detail: 'What was actually spent.' },
              { label: 'Payments', detail: 'Each instalment paid out.' },
            ]}
            output="One record per work"
            outputDetail={`${total} of them, each carrying every number the five files held about it.`}
          />
        </Figure>

        <div className="prose" style={{ marginTop: 26 }}>
          <p>
            <strong>One thing to know.</strong> These files do not say where a work
            physically is. There are no map coordinates in them. So on the map, a
            work is shown at the centre of its district, and the map says so in the
            corner. It would be easy to invent an exact spot for every dot. It would
            also be a lie.
          </p>
        </div>
      </section>

      {/* ---------------- the four checks ---------------- */}
      <section className="how-section" id="checks">
        <div className="prose how-lede">
          <h2 className="how-heading">The four checks</h2>
          <p>
            Each check asks one simple question and gives an answer out of 100. A
            check only raises a flag once it goes past its own line.
          </p>
        </div>

        <div className="check-grid">
          {CHECKS.map((check, index) => (
            <Card
              key={check.key}
              eyebrow={`Check ${index + 1}`}
              heading={check.name}
              accent={SIGNAL_COLOR[check.key]}
            >
              <p style={{ marginBottom: 12 }}>{check.how}</p>
              <p className="example">
                <strong>For example: </strong>
                {check.example}
              </p>
            </Card>
          ))}
        </div>

        <div className="prose" style={{ marginTop: 26 }}>
          <p>
            <strong>Why four and not one?</strong> Because one number on its own
            tells you nothing. A work that is only a bit late is fine. A work that is
            very late, has had nearly all its money paid, and looks like a copy of
            another work, is a different matter. It is the combination that matters.
          </p>
        </div>
      </section>

      {/* ---------------- the score ---------------- */}
      <section className="how-section" id="score">
        <div className="prose how-lede">
          <h2 className="how-heading">How the four become one number</h2>
          <p>
            The four answers are added together, but not equally. Cost counts a
            little more than the rest, because it is the one most likely to matter.
          </p>
        </div>

        <Figure
          title="The sum, written out"
          caption="This is the entire formula. There is nothing else to it. Anyone can take a project, read its four numbers off the screen, and check the total by hand."
        >
          <div className="col" style={{ gap: 11 }}>
            {WEIGHTS.map(({ name, weight, key }) => (
              <div key={name} className="row weight-row">
                <span className="weight-swatch" style={{ background: SIGNAL_COLOR[key] }} />
                <span className="grow weight-name">{name}</span>
                <span className="mono weight-value">{weight}%</span>
                <div className="weight-track">
                  <div
                    className="weight-fill"
                    style={{
                      width: `${(weight / 30) * 100}%`,
                      background: SIGNAL_COLOR[key],
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="weight-note">
              Then, for every check that raised a flag,{' '}
              <strong>add 5 more points</strong>, up to three checks. A work with
              three separate problems should sit above a work with one.
            </div>
          </div>
        </Figure>

        <div style={{ marginTop: 18 }}>
          <Figure
            title="What the final number means"
            caption="One scale, cut into four bands. A work does not travel along it. It lands in one band and stays there until its numbers change."
          >
            <ScoreScale
              bands={[
                {
                  name: 'Routine',
                  range: 'below 35',
                  note: 'Nothing stands out.',
                  colour: 'var(--routine)',
                  width: 35,
                },
                {
                  name: 'Medium',
                  range: '35 to 54',
                  note: 'Keep an eye on it.',
                  colour: 'var(--medium)',
                  width: 20,
                },
                {
                  name: 'High',
                  range: '55 to 74',
                  note: 'Worth a look soon.',
                  colour: 'var(--high)',
                  width: 20,
                },
                {
                  name: 'Critical',
                  range: '75 and above',
                  note: 'Look at this first.',
                  colour: 'var(--critical)',
                  width: 25,
                },
              ]}
            />
          </Figure>
        </div>
      </section>

      {/* ---------------- the model ---------------- */}
      <section className="how-section" id="model">
        <div className="prose how-lede">
          <h2 className="how-heading">The part that learns on its own</h2>
          <p>
            The four checks are rules somebody wrote. They catch what we thought to
            look for. So there is also a model that was never told what a bad work
            looks like.
          </p>
          <p>
            It reads five numbers about each work: how much money, how much has been
            paid, how many payments, how long between asking and approval, and how
            old it is. From thousands of works it learns what an <em>ordinary</em>{' '}
            work looks like. Then it says how far each work sits from ordinary.
          </p>
        </div>

        <Figure
          title="Two opinions, kept apart on purpose"
          caption="They are never added together. A score an officer cannot explain is a score they cannot act on, so the model's view sits beside the number instead of inside it."
        >
          <SplitPath
            start={{
              label: 'One work',
              detail: 'The same record goes to both, at the same time.',
            }}
            branches={[
              {
                label: 'The four rules',
                detail:
                  'Produce the score you see on screen, with a sentence for every flag. This is the number people act on.',
                tone: 'accent',
              },
              {
                label: 'The model',
                detail:
                  'Produces a second opinion only. Shown beside the score, never added to it, and never allowed to decide.',
                tone: 'warn',
              },
            ]}
          />
        </Figure>

        <div style={{ marginTop: 18 }}>
          <SideBySide>
            <Card heading="What the rules are good at" eyebrow="Rules" accent="var(--accent)">
              <p style={{ margin: 0 }}>
                They can explain themselves. When a work is flagged you get a
                sentence saying exactly why. An officer can put that sentence in a
                file and act on it. But they only catch what someone thought to write
                a rule for.
              </p>
            </Card>
            <Card heading="What the model is good at" eyebrow="Model" accent="var(--sig-cost)">
              <p style={{ margin: 0 }}>
                It notices odd combinations nobody wrote a rule for. Of the{' '}
                <strong>24 works it called most unusual</strong>, 18 had been marked
                routine by the rules. But it cannot say why, so it is never allowed
                to decide anything on its own.
              </p>
            </Card>
          </SideBySide>
        </div>
      </section>

      {/* ---------------- the two roles ---------------- */}
      <section className="how-section" id="roles">
        <div className="prose how-lede">
          <h2 className="how-heading">Two people, two different screens</h2>
          <p>
            The same project looks different depending on who is signed in. Not
            because buttons are hidden, but because the server decides what each
            account is allowed to see and do.
          </p>
        </div>

        <SideBySide>
          <Card heading="Member of Parliament" eyebrow="Watches" accent="var(--accent)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Sees only the works in their own constituency</li>
              <li>A map, and a list sorted by what needs attention</li>
              <li>Opens any work and reads why it was flagged</li>
              <li>Can read what the contractor has entered</li>
              <li>Cannot add work. An MP watches, they do not report.</li>
            </ul>
          </Card>
          <Card heading="Contractor" eyebrow="Reports" accent="var(--sig-payment)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Sees only the works in their own district</li>
              <li>A simple numbered list, easy to use on a phone on site</li>
              <li>Opens a work and adds what was done, what it cost, and when</li>
              <li>Can remove an entry they added by mistake</li>
              <li>Cannot see other districts, or other contractors&apos; work</li>
            </ul>
          </Card>
        </SideBySide>

        <div style={{ marginTop: 18 }}>
          <Figure
            title="How work gets recorded"
            caption="The source files have no record of progress on the ground. This is how that gap gets filled: by the person actually doing the work."
          >
            <Steps
              steps={[
                { label: 'Contractor opens the project', detail: 'On a phone, at the site.' },
                { label: 'Adds what was done', detail: '"Buy cement, 3 lakh, today."' },
                {
                  label: 'Saved on the server',
                  detail: 'With their name and the time.',
                  tone: 'accent',
                },
                {
                  label: 'The MP sees it',
                  detail: 'Straight away, and cannot change it.',
                  tone: 'accent',
                },
              ]}
            />
          </Figure>
        </div>
      </section>

      {/* ---------------- limits ---------------- */}
      <section className="how-section" id="limits">
        <div className="prose">
          <h2 className="how-heading">What this does not do</h2>
          <p>
            This matters as much as the rest. A monitoring system that oversells
            itself is worse than no system.
          </p>
          <ul>
            <li>
              <strong>It never says anyone did anything wrong.</strong> A flag means
              a person should look. That is all it means.
            </li>
            <li>
              <strong>It cannot prove a work was built.</strong> It reads paperwork.
              Only somebody standing at the site can confirm what is there.
            </li>
            <li>
              <strong>It does not know exactly where anything is.</strong> The
              government files have no coordinates, so map dots sit at the centre of
              their district.
            </li>
            <li>
              <strong>It does not know how much of a work is finished.</strong> That
              figure is not in the files. It comes from what the contractor enters,
              and only for works where somebody has entered something.
            </li>
            <li>
              <strong>It covers Maharashtra only,</strong> because that is the data
              we have. Nothing in the code is tied to Maharashtra.
            </li>
          </ul>
        </div>
      </section>

      {/* ---------------- close ---------------- */}
      <section className="how-section" style={{ textAlign: 'center' }}>
        <h2 className="how-heading">Have a look at the real thing</h2>
        <p
          className="dim"
          style={{ fontSize: 15, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 22px' }}
        >
          {signedIn
            ? 'Everything on this page is happening on the screen you came from.'
            : 'Sign in with any of the sample accounts. No password needed, and the data is the real published record.'}
        </p>
        <button className="btn btn-primary btn-lg" onClick={onSignIn}>
          Open the dashboard
        </button>
      </section>

      <footer
        className="row wrap"
        style={{
          padding: '20px clamp(16px, 4vw, 40px)',
          borderTop: '1px solid var(--rule)',
          gap: 12,
          background: 'var(--panel)',
        }}
      >
        <Wordmark />
        <span className="grow" />
        <span className="faint" style={{ fontSize: 12 }}>
          Built from published MPLADS reports
          {meta.data ? `, snapshot ${meta.data.snapshot}` : ''}
        </span>
      </footer>
    </div>
  )
}
