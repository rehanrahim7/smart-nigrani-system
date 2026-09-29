<<<<<<< HEAD
# Smart Nigrani System

**SIH26102 · Review support for MPLADS works in Maharashtra.**

Smart Nigrani System reads the five published MPLADS reports, joins them into one record per work (4,798 works, snapshot 9 September 2026), and helps people decide which works to look at first. It explains every flag in plain words. The people delivering the works record what they did, and upload site photographs, against the same list.

It is a review-support tool. A flag is a reason for a person to look. It is never a finding of fraud.

```
SmartNigraniSystem/
  backend/    FastAPI + SQLite: the data, the checks, the model, sign-in, every workflow
  frontend/   React + Vite website
  INTEGRATION.md   what was merged from the old and new sites, and why
```

---

## 1. Run it on your laptop

You need **Python 3.10 or newer** and **Node 20 or newer**. Use two terminal windows.

**Terminal 1, the data server:**

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check it at <http://localhost:8000/api/health>. The first start creates the database and the sample accounts by itself.

**Terminal 2, the website:**

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### Sign in

On the sign-in screen, pick a role tab and click any sample account. No password is typed or shown. To type one instead, open "Sign in with a username"; every sample account uses the password `nigrani`.

| Role | Sample account | What they do |
|---|---|---|
| Member of Parliament | `sanjay.jadhav` | Sees their works on a map and ranked list, why each was flagged, peers, timeline, the model's view; follows the team's updates; records decisions and asks for clarification or site visits |
| Contractor | `contractor.sanjay.jadhav` | Records work done and materials bought (quantity, unit, rate, invoice); adds site photographs. Is never sent a score or flag |
| Field officer | `officer.sanjay.jadhav` | Submits site photographs with a note, stage and optional location; can ask Gemini to describe a photo (when configured) |
| Implementing agency | `agency.sanjay.jadhav` | Registers new works and assigns a contractor and officer; adds contractors and officers to the team; acts on submissions |
| Research analyst | `analyst1` | Reads every work; imports newer report exports as separate datasets; switches datasets; records private decisions; presentation mode |

Every member has a team of four (member, contractor, field officer, agency) who see the same list of works: 47 teams, plus 2 analysts, 190 accounts in all.

### A two-minute walkthrough

1. Front page: the network of members (shown as MP 01 to MP 47) and their most flagged works. Click a work, then **Explore work**.
2. Try the tabs: **Why flagged**, **Peer comparison** (animated), **Timeline**, **Similar works**, **Model opinion**, **Source records**. **Export case file** downloads a Markdown case file.
3. Sign in as **Contractor for Sanjay Haribhau Jadhav**, open *Construction of Sabha mandap at Bor Ranjani*, **Work log → Add an entry**, add a material line, save.
4. Sign in as **Sanjay Haribhau Jadhav** (the member). **Updates and alerts** shows the entry. Open it and use **Act on this → Request clarification**.
5. Sign back in as the contractor: the request is shown under the entry.

---

## 2. What it does

### Three separate views of each work, never added together

| View | What it is | Where it comes from |
|---|---|---|
| **Review priority** (0 to 100, Critical / High / Medium / Routine) | Four checks: cost against works with similar descriptions, possible repeat of another work, time taken, money paid against progress. Weighted 30/25/25/20, plus 5 points for each check over its line (up to three). | The team's detector pipeline (`backend/data/source/`), unchanged. Runs on sanctioned works; everything else is labelled **Not checked**, not "Routine". |
| **Record checks** (seven rules) | Amount against its comparison group, similar description, more than 45 days to sanction, over a year without a completion record, sanction more than 10% above recommendation, successful payments above sanction, dates in the wrong order. | `backend/app/pipeline.py`, on every work, including imported datasets. |
| **Model percentile** | How statistically unusual a sanctioned work looks, from an Isolation Forest trained on 2,437 works. | `backend/data/model.json`, scored by `backend/app/anomaly.py`. |

None of these is a probability of fraud. The data contains no confirmed cases, so no accuracy figure exists and none is claimed.

### Public pages (no sign-in)

Splash and animated front page; member-to-work network; map of every work (district-level, labelled as approximate); the public register with search, filters, **Apply**, ten per page; every work's full investigation view; "How it works" with a method-notes search (plain word matching, not an AI assistant). Members appear only as aliases, constituencies and payee names are never shown, and nothing written by a delivery team is public.

### Delivery

Agency registers a work and assigns people → the contractor records itemised claims (the server does the arithmetic and notes: over the approved amount, repeated invoice and material, materials billed at Planning, a rate far above earlier claims for the same material and unit) → the field officer adds photographs (shrunk in the browser, JPEG checked on the server, exact re-use detected, location optional) → the member sees it all in **Updates and alerts** (checks again every 30 seconds; nothing is emailed or pushed) → the member or agency acts on each submission. Registered works past their completion target without 100% reported progress are listed as overdue.

### Research workspace

Dataset overview with the join's own totals; every work filterable by review label, record check, district and member, sortable by any of the three views; network; personal review decisions; dataset history and switching; import of five new CSV exports (validated by columns, analysed by the same join, record checks and model, kept as a separate dataset, never overwriting the original); presentation mode that shows aliases on screen only.

### Everywhere

Warm cream and burnt-orange design with a dark mode (toggle in the header, remembered). The screen, filters, selected work and tab live in the address, so refresh and Back keep your place. Forms keep their drafts through errors, page changes and refreshes, and each submission carries an id so pressing Save twice saves once.

---

## 3. The data

`backend/data/raw/` holds the supplied files: the five MPLADS reports (`Works Recommended.csv`, `Works Sanctioned.csv`, `Works Completed.csv`, `Expenditure on Completed and On-going Works as on Date.csv`, `Allocated Limit for Honble MPs.csv`) and the cleaned `NetraDrift_master_projects.csv` and `NetraDrift_payments.csv`.

`python scripts/prepare_data.py` joins the reports (9,929 rows → 4,798 works: 2,437 sanctioned and 2,361 recommendations without a work id), runs the record checks, joins the detector scores, scores the model, and writes `data/projects.json`. It also compares every sanctioned work with the cleaned master and prints any disagreement (currently 3 payments whose ids contain stray whitespace; the report join attaches them, the cleaned file did not).

Every work keeps the report rows it came from, and every payment keeps its row number.

---

## 4. Checks you can run

From `backend/` with the virtual environment active:

| Command | What it proves | Result at hand-over |
|---|---|---|
| `python scripts/verify_data.py` | The join reproduces all recorded totals; ids unique; provenance kept; model inputs in training order; **model score and percentile identical to training for all 2,437 works**; priority 4 Critical / 74 High / 186 Medium; `projects.json` up to date | 30 / 30 pass |
| `python scripts/test_workflows.py` | Every workflow, in-process on a throwaway database: public anonymity, roles and scoping, itemised expenses and their checks, retries, evidence and reuse, private photos, Gemini unavailable state, reviews, team, registration, updates, research import | 75 / 75 pass |
| `python scripts/smoke_test.py` | The running API end to end (start the server first) | 31 / 31 pass |

From `frontend/`: `npm run build` (type-check and production build) and `npm run lint`.

To retrain the model (this replaces `data/model.json`): `python scripts/prepare_data.py --training-input`, then `pip install -r analysis/requirements.txt` and `python analysis/train.py`. With the pinned scikit-learn 1.8.0 and numpy 2.3.5 this reproduces the shipped model's trees exactly.

---

## 5. Settings

All optional. Copy `backend/.env.example` to `backend/.env`.

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Signs sign-in tokens. **Change it before putting the site anywhere public.** |
| `DEMO_ACCOUNTS=off` | Removes the one-click sample sign-ins. |
| `DEMO_PASSWORD` | Password of the sample accounts (default `nigrani`). |
| `CORS_ORIGINS` | Extra website addresses allowed to call the API. |
| `GEMINI_API_KEY` | Turns on Gemini photo descriptions. **Not set in this hand-over, so the feature says it is not connected.** Server-side only; never put it in the frontend. |
| `GEMINI_MODEL` | Default `gemini-2.5-flash`. |
| `GEMINI_DAILY_LIMIT` | Descriptions per account per day, default 20. |
| `SNS_DB` | Path of the SQLite file, default `backend/data/sns.sqlite3`. |

Frontend: `VITE_API_BASE` (default `http://127.0.0.1:8000`) is read when the site is built.

---

## 6. Honest limits

- The reports have no coordinates: map positions are district centres, and the map says so.
- The reports have no quantities, specifications or progress figures: amount comparisons are totals, and progress is only what the delivery team reports.
- A missing completion record does not prove a work is unfinished.
- Payments have no transaction ids, so a repeated payment cannot be told from a second instalment.
- Photographs and device locations are submitted by people and can be wrong; a person reviews them.
- Gemini is wired in but has **not** been tested against the real service, because no key was available.
- The four checks cannot be run on imported datasets (they come from the team's offline pipeline with a sentence-transformer model); imports show "Not checked".
- Updates refresh by polling every 30 seconds. There is no email, SMS or push.
- Contractor, officer and agency accounts are sample accounts; the roles are enforced by the server, but no government identity check exists.
- There is no RAG or AI assistant. The method-notes search matches words.
- Camera, GPS and phone layout were checked in a desktop browser (including a 390-pixel-wide frame), not on a real phone.
=======
# Smart Nigrani System: backend

FastAPI + SQLite. Serves the 4,798 MPLADS works, the three views of each (review priority, record checks, model percentile), sign-in for five roles, and every delivery and research workflow.

Running it, the accounts, the settings and the checks are in the [top-level README](../README.md).

## Where things are

```
app/
  main.py        starts the app, health check, /api/meta
  config.py      settings (all optional, see .env.example)
  pipeline.py    joins the five reports into one record per work; the seven record checks; the model's five inputs
  enrich.py      map position, sector, the team's four checks and review priority, model score
  anomaly.py     the Isolation Forest, scored in plain Python (unchanged)
  delivery.py    registered works, expense checks, overdue days
  store.py       projects in memory; SQLite for accounts, work logs, evidence, reviews, datasets
  deps.py        who is calling, and what they may see
  security.py    password hashing and signed tokens
  models.py      request shapes and their validation
  routers/       auth, public, projects, works (work log), delivery, research, stats
analysis/
  train.py              the training script (unchanged)
  model-card.json       what the model is and is not
  training-scores.json  the score scikit-learn gave each trained work, for the parity check
data/
  raw/           the supplied reports and cleaned files
  source/        the team's detector output (the four checks)
  model.json     the trained model (unchanged)
  projects.json  built by scripts/prepare_data.py
  sns.sqlite3    created on first start
scripts/
  prepare_data.py    build data/projects.json from data/raw
  verify_data.py     data and model checks
  test_workflows.py  every workflow, on a throwaway database
  smoke_test.py      the running API end to end
  seed_users.py      the 190 sample accounts (run automatically on first start)
  sync_supabase.py   optional one-way copy of projects, users and work logs to Supabase
```

## Who can do what

| Action | Allowed for |
|---|---|
| Read four-check, record-check and model results | MP, analyst (never sent to the other roles) |
| Add a work log entry | contractor |
| Add a field photograph, ask Gemini to describe it | contractor, field officer |
| Act on a submission | MP, agency |
| Record a decision on a whole work | MP, analyst |
| Register a work, add contractors and officers | agency |
| Import datasets, switch datasets | analyst |

A team role sees only its member's works; a contractor or officer sees a registered work only if assigned to it. Anything outside scope returns 404, not 403.

The API's own documentation is at <http://localhost:8000/docs> while the server runs.
>>>>>>> da5f239 (Deploy Smart Nigrani System)
