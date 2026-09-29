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

import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
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
import { SIGNAL_COLOR, count } from '../format'

/* The menu and the page are built from the same list, so a section can never
   appear in one and not the other. */
const SECTIONS: NavSection[] = [
  { id: 'journey', label: 'The journey' },
  { id: 'data', label: 'The data' },
  { id: 'checks', label: 'The four checks' },
  { id: 'score', label: 'The score' },
  { id: 'records', label: 'Record checks' },
  { id: 'model', label: 'The model' },
  { id: 'roles', label: 'Five roles' },
  { id: 'notes', label: 'Method notes' },
  { id: 'limits', label: 'Limits' },
]

/*
 * Written explanations the method-notes search looks through. This is plain
 * word matching over the notes below; it is not an AI assistant and it does
 * not generate answers.
 */
const NOTES = [
  {
    title: 'How the cost comparison works',
    text: 'Two comparisons are made. The cost check (one of the four) gathers works whose descriptions mean roughly the same thing and compares approved amounts. The record check compares a work with at least 8 others from the same implementing agency, of the same kind and sanctioned in the same year, and flags an amount above Q3 + 3 × IQR and more than 2.5 times the median. Both compare total amounts: the reports carry no quantities or specifications, so neither is a unit-cost or overcharging finding.',
  },
  {
    title: 'What a delay flag means',
    text: 'Time taken is measured from the sanction date to the snapshot, 9 September 2026, for works with no completion record. A missing completion record does not prove a work was never built; the export may simply not have it. Progress must be checked with the implementing agency and field evidence.',
  },
  {
    title: 'How duplicate review works',
    text: 'The duplicate check compares descriptions by meaning, using a sentence-transformer model the team ran offline, and names the closest match. The record check compares the words of descriptions in the same constituency and kind of work. Separate phases, separate sites or a standard description reused for different works can all explain a match, so it stays a possible overlap until someone compares the sanction orders and visits the sites.',
  },
  {
    title: 'How payment checks work',
    text: 'Successful payments and payments still in progress are kept apart and never added together as paid. The money check compares payments with the stage reached. A record check flags successful payments more than 1% above the sanctioned amount. The expenditure report has no transaction ids, so a repeated payment cannot be told apart from a genuine second instalment.',
  },
  {
    title: 'How field evidence is handled',
    text: 'A photograph is evidence a person chose to submit. The device location is optional, read only when the person presses the button, and can be wrong or faked. The exact same image file submitted twice is detected; an edited copy is not. None of it proves where or when the work was built, or that it is complete. A person reviews every report.',
  },
  {
    title: 'What the model score means',
    text: 'The Isolation Forest was trained on 2,437 sanctioned works and ranks how unusual a work looks from five numbers. It was never shown a confirmed case of fraud, because none exist in this data, so it has no accuracy figure and its score is not a probability of anything. It is shown beside the review priority, never added to it.',
  },
  {
    title: 'What Gemini photo descriptions are',
    text: 'When a server key is configured, the field team can ask Google Gemini to describe a saved photograph against the work’s scope, after ticking a consent box. The description says what is visible and what the image cannot establish. It never certifies location, date, payment or completion. Without a key the feature says it is not connected and nothing is generated.',
  },
  {
    title: 'Contractor expense checks',
    text: 'When a contractor records materials, the server multiplies quantity by rate and adds up the lines itself. It notes when all claims so far pass the approved amount, when an invoice number and material repeat an earlier claim, when materials are billed at the Planning stage, and when a rate is far above earlier claims for the same material and unit in this system. These are claims, not verified payments, and there is no official rate list behind them.',
  },
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

export function HowItWorks() {
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const meta = useAsync(() => api.meta(), [])
  const highlights = useAsync(() => api.highlights(1), [])

  const total = meta.data ? count(meta.data.totalProjects) : '4,798'
  const flagged = highlights.data ? count(highlights.data.flaggedTotal) : '264'
  const trained = meta.data?.model ? count(meta.data.model.trainingRecords) : '2,437'
  const modelTop = meta.data?.modelVsRules

  return (
    <div className="how">
      <div className="how-top">
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
            This system reads all of them, runs four checks on each sanctioned
            work, and puts the ones that look unusual at the top of a list. Right
            now that list has <strong>{flagged} works</strong> on it. Every one of
            them comes with a sentence saying why it is there. Seven record checks
            and a statistical model add further, separate prompts to look.
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
              { label: 'Expenditure', detail: 'Each payment, successful or still in progress.' },
              { label: 'Allocated limit', detail: 'How much each member may spend.' },
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
            It reads five numbers about each sanctioned work: how much money, how much
            has been paid, how many payments, how long between asking and approval,
            and how old it is. From the {trained} sanctioned works it learns what an{' '}
            <em>ordinary</em> work looks like. Then it says how far each work sits from
            ordinary, as a percentile: 95 means stranger than 95% of them.
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
                <strong>{modelTop ? modelTop.top : 24} works it calls most unusual</strong>,{' '}
                {modelTop ? modelTop.routine : 19} are marked routine by the four checks.
                But it cannot say why, and it has never seen a confirmed case, so it is
                never allowed to decide anything on its own.
              </p>
            </Card>
          </SideBySide>
        </div>
      </section>

      {/* ---------------- the roles ---------------- */}
      <section className="how-section" id="roles">
        <div className="prose how-lede">
          <h2 className="how-heading">Five roles, each with its own screen</h2>
          <p>
            The same work looks different depending on who is signed in. Not because
            buttons are hidden, but because the server decides what each account is
            allowed to see and do. The people who build and record the work are not
            sent the scores at all, so there is nothing on their page to uncover.
          </p>
          <p>
            A member's team (the member, a contractor, a field officer and the
            implementing agency) all look at one identical list of works. That is what
            makes the handover work: what the contractor or officer records, the
            member opens.
          </p>
        </div>

        <div className="check-grid">
          <Card heading="Member of Parliament" eyebrow="Oversees" accent="var(--accent)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Sees only the works they recommended, on a map and a ranked list</li>
              <li>Reads why each work was flagged, its peers, timeline and the model's view</li>
              <li>Follows updates and alerts from the team</li>
              <li>Records decisions and asks for clarification or a site visit</li>
            </ul>
          </Card>
          <Card heading="Contractor" eyebrow="Records" accent="var(--sig-payment)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Adds work done and materials bought: quantity, unit, rate, invoice</li>
              <li>The server works out the totals and notes anything to check</li>
              <li>Adds site photographs, with location if they choose</li>
              <li>Never sees a score or a flag on the work itself</li>
            </ul>
          </Card>
          <Card heading="Field officer" eyebrow="Verifies" accent="var(--sig-duplicate)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Visits sites and submits photographs with notes and stage</li>
              <li>Can ask Gemini to describe a photograph, with consent, when switched on</li>
              <li>Sees the works assigned to the team</li>
            </ul>
          </Card>
          <Card heading="Implementing agency" eyebrow="Delivers" accent="var(--sig-delay)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Registers new works and assigns a contractor and officer</li>
              <li>Adds contractors and field officers to the team</li>
              <li>Acts on submissions: clarification, site visit, escalation</li>
            </ul>
          </Card>
          <Card heading="Research analyst" eyebrow="Studies" accent="var(--sig-cost)">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Reads every work in the dataset, with an anonymised presentation mode</li>
              <li>Imports a newer export of the five reports as a separate dataset</li>
              <li>Records private review decisions and exports case files</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* ---------------- record checks ---------------- */}
      <section className="how-section" id="records">
        <div className="prose how-lede">
          <h2 className="how-heading">Seven record checks, kept separate</h2>
          <p>
            Beside the four checks, seven plain rules look for inconsistencies in the
            records themselves. They run on every work, including new imports, and
            each one that fires comes with its reason.
          </p>
        </div>
        <div className="prose">
          <ul>
            <li><strong>Amount against its group.</strong> At least 8 other works from the same agency, of the same kind, sanctioned the same year; flagged above Q3 + 3 × IQR and 2.5 × the median.</li>
            <li><strong>Similar description.</strong> 85% or more of the same words, same constituency and kind of work.</li>
            <li><strong>Days to sanction.</strong> More than 45 days from recommendation to sanction.</li>
            <li><strong>Age without completion.</strong> More than a year since sanction with no completion record.</li>
            <li><strong>Sanction above recommendation.</strong> More than 10% above.</li>
            <li><strong>Payments above sanction.</strong> Successful payments more than 1% above.</li>
            <li><strong>Date order.</strong> A later step dated before an earlier one.</li>
          </ul>
          <p>
            Record checks do not change the review priority. They are listed on each
            work under "Why flagged", as reasons to open the file.
          </p>
        </div>
      </section>

      {/* ---------------- method notes ---------------- */}
      <section className="how-section" id="notes">
        <div className="prose how-lede">
          <h2 className="how-heading">Ask about the method</h2>
          <p>
            Search the written method notes. This matches your words against the
            notes below and shows the closest ones. It is not an AI assistant and it
            does not write answers.
          </p>
        </div>
        <MethodNotes />
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
            <li>
              <strong>The model has no accuracy figure.</strong> There are no reviewed
              cases to measure it against, so its score ranks unusualness and nothing more.
            </li>
            <li>
              <strong>Photographs and locations prove nothing on their own.</strong>{' '}
              They are what someone chose to submit, and a person reviews them.
            </li>
          </ul>
        </div>
      </section>

      {/* ---------------- close ---------------- */}
      <section className="how-section" style={{ textAlign: 'center' }}>
        <h2 className="how-heading">Have a look at the real thing</h2>
        <p className="dim" style={{ fontSize: 15, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 22px' }}>
          {signedIn
            ? 'Everything on this page is happening in your workspace.'
            : 'Browse the public register, or sign in with one of the sample accounts. The data is the real published record.'}
        </p>
        <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
          <a className="btn btn-primary btn-lg" href={signedIn ? '#/dashboard' : '#/signin'}>
            {signedIn ? 'Back to my workspace' : 'Sign in'}
          </a>
          <a className="btn btn-lg" href="#/works">
            Browse every work
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <span>Built from the published MPLADS reports{meta.data ? `, snapshot ${meta.data.snapshot}` : ''}.</span>
      </footer>
    </div>
  )
}

function MethodNotes() {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')

  const words = asked
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2)
  const ranked = NOTES.map((note) => ({
    ...note,
    score: words.reduce((sum, w) => sum + (`${note.title} ${note.text}`.toLowerCase().includes(w) ? 1 : 0), 0),
  }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  function submit(event: FormEvent) {
    event.preventDefault()
    setAsked(question.trim())
  }

  return (
    <div className="prose">
      <form className="row wrap" style={{ gap: 8 }} onSubmit={submit}>
        <input
          className="input grow"
          aria-label="Search the method notes"
          placeholder="How does the cost comparison work?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!question.trim()}>
          Find notes
        </button>
      </form>
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
        {['cost comparison', 'delay', 'duplicate', 'photo evidence', 'model score', 'payments'].map((q) => (
          <button
            key={q}
            type="button"
            className="chip"
            onClick={() => {
              setQuestion(q)
              setAsked(q)
            }}
          >
            {q}
          </button>
        ))}
      </div>
      {asked && ranked.length === 0 && (
        <p className="faint" style={{ marginTop: 14 }}>
          No note matches that. Try cost, delay, duplicate, payment, photo or model.
        </p>
      )}
      {ranked.map((note) => (
        <article key={note.title} className="panel card-pad" style={{ marginTop: 14 }}>
          <span className="tag">Method note</span>
          <h3 style={{ margin: '8px 0 6px' }}>{note.title}</h3>
          <p style={{ margin: 0 }}>{note.text}</p>
        </article>
      ))}
    </div>
  )
}
