# Smart Nigrani System backend (SIH26102)

This folder holds the **API** (Application Programming Interface, the server
that the website talks to in order to get data). It is written in Python using
**FastAPI**, a library for building web APIs.

---

## 1. What this is

Smart Nigrani System monitors **MPLADS** projects. MPLADS stands for *Members of
Parliament Local Area Development Scheme*: every Member of Parliament (MP) gets
a yearly budget to recommend small public works (roads, community halls,
borewells, street lights) in their constituency. The money is real, the paper
trail is public, and nobody has time to read all of it.

This backend serves **4,807 real public-works records from Maharashtra**, taken
from published MPLADS reports. For each record it serves:

* the basic facts (what the work is, who recommended it, which district, how
  much money was sanctioned, how much was paid, current status),
* four **detector scores** that say how unusual the record looks,
* one combined **review priority score** from 0 to 100, plus a plain-English
  sentence explaining each score,
* a **work log**, a table where a contractor records what work they did, what
  it cost, and on what date.

Two kinds of accounts sign in, and each one sees a different slice of the
data. This is enforced on the server, not by hiding things in the browser:

| Role | Who they are | What they can see |
| --- | --- | --- |
| `mp` | A Member of Parliament | Only the works that this MP recommended |
| `vendor` | A contractor working in one district | Only the works in that district; they are the only role that can add work-log entries |

There used to be a third role called `ministry`. It has been removed from the
code. If you find that word anywhere, it is out of date.

One small part of the API needs no account at all: `GET
/api/public/highlights`, which feeds the three example works shown on the
public landing page. It leaves out the MP's name on purpose. See section 6.

An important framing point for the presentation: the score is a **review
priority**, not an accusation. A high score means "a human should look at this
first", not "this is fraud". The API says this in its own `/api/meta` response.

**The frontend (the React website in `../frontend`) cannot show any data unless
this backend is running.** Always start this one first.

---

## 2. What you need installed

| Thing | Version | How to check |
| --- | --- | --- |
| Python | 3.10 or newer (the team uses 3.13) | `python --version` |
| pip | comes with Python | `pip --version` |

Nothing else. There is no database server to install, no Docker, no Node.js on
this side. All the Python libraries get installed in step 2 below.

On some machines the command is `python3` and `pip3` instead of `python` and
`pip`. If `python --version` prints Python 2 or fails, use `python3` everywhere
in this document.

---

## 3. Setup steps

Run every command from **inside this `backend` folder**.

### Step 1. Create a virtual environment

A *virtual environment* is a private folder of Python libraries kept for this
project alone, so installing things here cannot break other Python projects on
your laptop.

```bash
python -m venv .venv
```

### Step 2. Activate it

macOS or Linux:

```bash
source .venv/bin/activate
```

**Windows note.** On Windows use this instead:

```
.venv\Scripts\activate
```

(In Windows PowerShell, if you get a message about scripts being disabled, run
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` once in that same
window, then activate again.)

You will know it worked because your command prompt now starts with `(.venv)`.
**You must do this in every new terminal window** before running any command
below.

### Step 3. Install the libraries

```bash
pip install -r requirements.txt
```

This installs five packages: FastAPI, Uvicorn (the web server that runs
FastAPI), Pydantic (checks that incoming data has the right shape),
python-dotenv (reads the optional `.env` settings file), and httpx (only used
by the optional Supabase script).

### Step 4. Build the project dataset

```bash
python scripts/prepare_data.py
```

This reads the raw CSV files in `data/source/` and writes one cleaned file,
`data/projects.json`, containing all 4,807 records with their scores already
calculated. It prints a summary table when it finishes. You only need to run
this once, or again if the source CSVs change.

This script also rewrites the wording of the explanations into plain English.
The source files talk about "semantic peers", "IDA" and "workflow status",
which nobody reads for the first time and understands. Two parts of the script
do this:

1. `PHRASES`, a list of pairs of the form (old wording, new wording). For
   example "Same IDA: True" becomes "Handled by the same district office: yes".
2. `plain_english()`, which applies every pair in that list to one sentence.

**No number, name or claim is changed, only the words around them.** The
untouched originals stay in `data/source/` if you want to check.

The four checks are also given readable names in `CHECK_NAMES`:

| Key in the data | Name shown on screen |
| --- | --- |
| `cost` | Cost compared with similar works |
| `duplicate` | Looks like another work |
| `delay` | Time taken |
| `payment` | Money paid against progress |

### Step 5. Create the login accounts

```bash
python scripts/seed_users.py
```

This creates **86 accounts** in a local database file (`data/sns.sqlite3`):

| Role | How many | One per |
| --- | --- | --- |
| `mp` | 47 | Member of Parliament found in the data |
| `vendor` | 39 | implementing district found in the data |

It prints a few sample usernames at the end.

The script also **deletes any account whose role is no longer supported**. Only
`mp` and `vendor` are supported now, so an old `ministry` account left over
from an earlier version is removed the next time you run this. Re-running the
script is therefore also the way to clean up.

Every account uses the same password: **`nigrani`**

Examples you can sign in with:

| Username | Password | Role |
| --- | --- | --- |
| `sanjay.jadhav` | `nigrani` | MP, sees only their own recommended works |
| `vendor.jalna` | `nigrani` | Vendor, sees only Jalna district, can add work-log entries |

Usernames for MPs are built from the name in the data as
`firstname.lastname` (for example `DR. PRASHANT YADAORAO PADOLE` becomes
`prashant.padole`). Vendor usernames are `vendor.<district>`. The seed script
prints samples; you can also see them on the website's sign-in screen.

**How the sample accounts are chosen.** `store.sample_logins()` picks 6 MP
accounts and 6 vendor accounts, ranked by **how many flagged works the account
can see**, highest first. They are not in alphabetical order. Alphabetical
order put all 47 members ahead of the first contractor, and landed on accounts
whose dashboards are almost empty, which is a poor first look at a system about
finding problems. Ranking both lists the same way also means the members and
the contractors on offer cover the same districts, so the "contractor records
work, member sees it" walkthrough works with two accounts from that list.

### Step 6. Start the server

```bash
uvicorn app.main:app --reload --port 8000
```

`--reload` means the server restarts by itself whenever you edit a Python file,
which is what you want while developing. Leave this terminal window open. The
server runs until you press `Ctrl+C`.

---

## 4. How to check it worked

**Check 1. The server answers.** Open <http://localhost:8000> in a browser.
You should see a small block of text naming the service and the number of
projects.

**Check 2. The interactive documentation.** Open
<http://localhost:8000/docs>. FastAPI generates this page automatically from
the code: it lists every endpoint, and you can try each one from the browser.
This is the fastest way to understand the API, and a good thing to show a
judge. (`/redoc` is the same information in a different layout.)

**Check 3. The full automated test.** In a **second** terminal (leave the
server running in the first), activate the virtual environment again and run:

```bash
python scripts/smoke_test.py
```

This runs **29 checks** against the live server. It signs in three times (two
different MP accounts and one vendor), walks every endpoint the dashboard uses,
and proves the role boundaries still hold (for example, that one MP gets "not
found" for another MP's project). It cleans up any test rows it created. You
want to see `29 passed, 0 failed`. If the server is not running it says so in
one clear line instead of failing 27 times.

Two MP accounts are used rather than one because that is the only honest way to
show that one member's data is hidden from another.

The test targets `http://127.0.0.1:8000` by default. To point it somewhere
else, pass the address: `python scripts/smoke_test.py http://localhost:8001`.

---

## 5. What every folder and file does

| Path | What it does |
| --- | --- |
| `app/main.py` | Starts the app. Wires up the five route groups, allows the frontend to call the API (CORS), compresses responses, turns any crash into a polite error instead of a stack trace, and on startup loads the dataset and auto-creates accounts if none exist. Also defines `/`, `/api/health` and `/api/meta`. |
| `app/config.py` | All settings in one place, each with a working default, so the server runs with no configuration file at all. Reads an optional `.env` file. |
| `app/store.py` | All data access. Loads `data/projects.json` into memory once, filters and sorts it, narrows it by role, and reads/writes users and work logs in SQLite. |
| `app/security.py` | Password hashing (PBKDF2, from Python's standard library) and signed session tokens. No external security libraries on purpose, so there are fewer things to fail to install. |
| `app/deps.py` | Answers "who is calling, and are they allowed?". `current_user` resolves the token, `require_roles` restricts a route to certain roles, `visible_project` returns a project only if this user is allowed to see it (otherwise 404, never 403, so the API never confirms a record exists to someone with no right to it). |
| `app/models.py` | The expected shape of requests and responses, using Pydantic. This is what rejects a bad date or a negative cost with a clear message. |
| `app/routers/auth.py` | Sign in, "who am I", the sample-account list shown on the login screen, and the one-click sample sign-in. |
| `app/routers/public.py` | The only routes that need no account: `GET /api/public/highlights`, which feeds the examples on the public landing page. |
| `app/routers/projects.py` | The project list, the map points, the filter dropdown options, and one project's full record. |
| `app/routers/stats.py` | The dashboard headline numbers, the chart data, and the review queue. |
| `app/routers/works.py` | The contractor work log: read it, add to it (vendors only), delete your own entry. |
| `app/routers/__init__.py`, `app/__init__.py` | Empty files that make Python treat these folders as importable packages. |
| `scripts/prepare_data.py` | Builds `data/projects.json` from the raw CSVs and calculates every score. **This is where the scoring formula lives**, and where the explanations are rewritten into plain English. |
| `scripts/seed_users.py` | Creates the 86 demo accounts from the names in the data, and removes accounts with a role that is no longer supported. |
| `scripts/smoke_test.py` | The 29-check end-to-end test described above. Uses only the standard library, so it runs on a laptop with nothing installed. |
| `scripts/schema.sql` | Optional. The PostgreSQL table definitions for the Supabase setup. Not needed for the normal SQLite setup. |
| `scripts/sync_supabase.py` | Optional. Uploads `projects.json` and the seeded users to Supabase. |
| `data/source/*.csv` | The raw inputs from the analysis pipeline. `prepare_data.py` reads five of them: `master_projects.csv`, `semantic_peer_cost_scores.csv`, `delay_scores.csv`, `payment_progress_scores.csv`, `duplicate_scores.csv`. The other two (`payments.csv`, `peer_cost_scores.csv`) are kept for reference but are not read by the current script. |
| `data/district_coords.json` | Map coordinates for each Maharashtra district, plus name aliases. Used to place markers. |
| `data/projects.json` | **Generated.** The cleaned dataset the API serves. Created by step 4. |
| `data/sns.sqlite3` | **Generated.** The local database holding accounts and work-log entries. Created by step 5. (The `-wal` and `-shm` files next to it are SQLite's own working files; ignore them.) |
| `requirements.txt` | The list of Python libraries to install. |
| `.env.example` | A copy-and-edit template of the optional settings. Copy it to `.env` if you need to change anything. |

### Settings you can change

All of these live in `app/config.py`, each with a default that works. You
change one by putting it in a `.env` file next to `requirements.txt`, or by
setting it as an environment variable before starting the server. Restart the
server afterwards; `.env` is read once at startup.

| Setting | Default | What it does |
| --- | --- | --- |
| `SNS_DB` | `data/sns.sqlite3` | Where the SQLite file holding accounts and work logs is kept. Point it somewhere else to keep two separate copies. |
| `DEMO_PASSWORD` | `nigrani` | The shared password given to every account created by `seed_users.py`. |
| `DEMO_ACCOUNTS` | `on` | Whether the two sample-account endpoints exist. See below. |
| `SECRET_KEY` | `sns-dev-key-change-in-production` | Signs session tokens. Change it and every existing token stops working. |
| `TOKEN_TTL_SECONDS` | `43200` (12 hours) | How long a session token lasts. |
| `CORS_ORIGINS` | the four localhost addresses | Which website addresses are allowed to call this API. |
| `DATA_BACKEND` | `local` | Only records whether a Supabase mirror is configured. It does not change where the running API reads or writes. See section 8. |

`DEMO_ACCOUNTS=off` turns off both `GET /api/auth/demo-accounts` and `POST
/api/auth/demo-login`; both then return 404. Accepted "off" values are `off`,
`false`, `0` and `no`; anything else counts as on.

**Set `DEMO_ACCOUNTS=off` before any real deployment.** Those two endpoints
exist so a visitor can look around a demo without being handed credentials.
On a live system they are a list of working accounts anyone can sign in to.
The accounts themselves also all share one printed password, so a real
deployment needs new accounts as well, not only this switch.

### A note on storage

By default (`DATA_BACKEND=local`) nothing leaves your laptop:

* the 4,807 projects are read **once** from `data/projects.json` and kept in
  memory. 4,807 records is small enough that filtering in memory is faster
  than asking a database, and it means the demo works with no internet;
* accounts and work-log entries live in **SQLite**, which is one single file
  (`data/sns.sqlite3`). There is no database server to start.

Supabase/PostgreSQL is entirely optional; see section 8.

---

## 6. The API endpoints

"Endpoint" means one address the API answers on. Base address while developing:
`http://localhost:8000`.

Anything marked *signed in* needs the `Authorization: Bearer <token>` header,
where the token comes from `POST /api/auth/login`. The frontend does this for
you; on the `/docs` page you can paste a token in as well.

| Method | Path | Who can call it | What it returns |
| --- | --- | --- | --- |
| GET | `/` | Anyone | Service name, problem statement, snapshot date, project count |
| GET | `/api/health` | Anyone | `ok`, number of projects loaded, number of accounts, snapshot date. The website uses this for its connection indicator |
| GET | `/api/meta` | Anyone | Where the data comes from, the scoring weights and thresholds, and the known limits of the dataset. Powers the public landing page |
| GET | `/api/public/highlights` | Anyone | The most flagged works, for the public landing page. Optional `limit` (1–12, default 3). Returns the snapshot date, `flaggedTotal` (how many works are flagged in the whole dataset), and the works themselves with their scores and reasons |
| POST | `/api/auth/login` | Anyone | Sends `{username, password}`, gets back a session token and the user's details. Wrong username and wrong password both return 401 with the same message and take the same time |
| GET | `/api/auth/me` | Signed in | The account the token belongs to. Used to restore a session after a page refresh |
| GET | `/api/auth/demo-accounts` | Anyone | Twelve sample accounts (6 MP, 6 vendor) for the sign-in screen: username, name, role and scope. **It does not return the password.** 404 when `DEMO_ACCOUNTS=off` |
| POST | `/api/auth/demo-login` | Anyone | Sends `{"username": "..."}` and gets back a session token, with no password crossing the network. Returns **403** for any username not on the list above, so it cannot be used to reach an arbitrary account. 404 when `DEMO_ACCOUNTS=off` |
| GET | `/api/stats` | Signed in (any role) | Headline numbers for this user's scope: totals, sanctioned, completed, delayed, flagged, budget, money spent, utilisation, counts per risk label |
| GET | `/api/stats/charts` | Signed in (any role) | Aggregated data for the charts: by status, by category, by risk label, by district, and how many records each detector fired on. Optional `top` (3–25, default 8) |
| GET | `/api/stats/review-queue` | Signed in (any role) | The highest-priority records, routine ones excluded, each with the reasons it was flagged. Optional `limit` (1–100, default 10) |
| GET | `/api/projects` | Signed in (any role) | One page of projects the caller may see. Optional `search`, `district`, `category`, `status`, `risk`, `constituency`, `member`, `sort` (`risk`, `amount`, `recent`, `name`), `page`, `limit` (1–200, default 25). Returns `items`, `total`, `page`, `limit`, `pages` |
| GET | `/api/projects/map` | Signed in (any role) | Map markers (id, name, district, latitude, longitude, score, label, budget, status) for the same filters. Optional `limit` (default 2000, max 5000) |
| GET | `/api/projects/filters` | Signed in (any role) | The dropdown options (districts, categories, statuses, constituencies, members, risk labels), limited to what this user can see |
| GET | `/api/projects/{project_id}` | Signed in, and only if the project is in their scope | One project's complete record, including all four detector scores with their explanations, the peer-cost comparison, any duplicate match, and the work log |
| GET | `/api/projects/{project_id}/works` | Signed in, same scope rule | The work-log entries for that project, oldest first |
| POST | `/api/projects/{project_id}/works` | **Vendor only**, and only in their own district | Adds a work-log entry (`work`, `cost`, `date` as `YYYY-MM-DD`, optional `note`). Returns the saved row plus `exceedsBudget`, `projectedTotal` and `budget`. It **warns** when the logged total passes the sanctioned budget but still saves. Recording overspend is the point |
| DELETE | `/api/projects/{project_id}/works/{work_id}` | **Vendor only**, and only their own entry | Deletes one entry. This is the undo button for a mistyped row |

### What the public highlights endpoint holds back

`GET /api/public/highlights` needs no sign-in, so it is deliberately narrower
than the signed-in project routes. Everything it returns is already published
by the government in the MPLADS reports. Even so, two things are left out:

1. **The MP's name.** The work is a public record, but putting a named person
   beside the word "Critical" on a page with no sign-in is a different thing.
   Each work is identified by its short reference (for example `SNS-2232`)
   instead.
2. **The contractor work log.** Those rows are written inside this system and
   are not public records at all.

### Why `demo-accounts` no longer returns the password

An earlier version sent the shared password to the browser so the sign-in
screen could print it. That was removed on purpose. Printing a working password
in the interface is a bad habit to show a panel of judges, even on demo data,
and it puts the password in the page source of a public site.

The sign-in screen now calls `POST /api/auth/demo-login` instead. The browser
sends only the username, the server checks it against the same short list it
advertises, and sends back a token. The password never leaves the server.

Two details that will otherwise waste your time:

1. **Project ids contain slashes**, for example
   `WS/MP681/2024-2025/143652`. The route uses FastAPI's `:path` converter so
   the whole thing is captured as one id. The full URL therefore looks like
   `/api/projects/WS/MP681/2024-2025/143652`.
2. Because of that, **route registration order matters** in `app/main.py`: the
   work-log routes are registered *before* the project routes, otherwise the
   greedy id matcher would swallow the trailing `/works` and return 404. There
   is a comment in `main.py` saying exactly this. Do not reorder those lines.

---

## 7. How the risk score is calculated

All of this happens in `scripts/prepare_data.py` when you run step 4. The API
never recalculates it at request time; it only serves the numbers.

### Step A. Four detectors, each scoring 0 to 100

The names in the first column are the ones shown on screen. They are set in
`CHECK_NAMES` in `scripts/prepare_data.py`.

| Detector | Key | What it looks for | Counted as "fired" at |
| --- | --- | --- | --- |
| Cost compared with similar works | `cost` | The work costs far more than similar works from the same period. "Similar" is decided by comparing the work descriptions, not the category alone | score ≥ **50** |
| Looks like another work | `duplicate` | Another record describes almost the same work, often in the same agency and constituency. Could be a data-entry error, could be a double sanction | score ≥ **75** |
| Time taken | `delay` | Sanctioned a long time ago with no completion record, or stuck at an early stage of the workflow | score ≥ **60** |
| Money paid against progress | `payment` | Money has moved ahead of the work. Most of the budget is paid while the status still says something early like "Vendor Identification" | score ≥ **50** |

Each detector also produces a sentence explaining itself, which is what the
"Why flagged" tab in the website shows. Those sentences are passed through
`plain_english()` first, as described in step 4 of the setup.

### Step B. Combine them into one review priority

```
priority = 0.30 × cost
         + 0.25 × duplicate
         + 0.25 × delay
         + 0.20 × payment

priority = priority + (5 × number of detectors that fired, counting at most 3)

priority = capped to the range 0–100, rounded to one decimal place
```

The bonus rewards records where **several independent detectors agree**. One
detector at 80 is one opinion; three detectors at 55 is a pattern. The cap of
three means the bonus can never add more than 15 points.

### Step C. Turn the number into a label

| Score | Label |
| --- | --- |
| 75 and above | **Critical Review** |
| 55 to 74.9 | **High Review** |
| 35 to 54.9 | **Medium Review** |
| below 35 | **Routine** |

Anything that is not "Routine" is counted as *flagged* and appears in the
review queue.

### What comes out of it

On the current snapshot (dated 2026-09-09), of 4,807 records:
4 Critical Review, 74 High Review, 186 Medium Review, 4,543 Routine. 1,449
records carry a non-zero signal of some kind. 2,430 records are sanctioned
works; the remaining 2,377 are recommendations that were never sanctioned, and
those carry no detector scores because the source detector files only cover
sanctioned works.

### If you change the weights

The same numbers appear in three other places and will silently disagree if you
change only one:

* `app/main.py`: the `methodology` block in `/api/meta`, which the landing
  page displays;
* `app/routers/stats.py`: the `thresholds` dictionary used to count how many
  records each detector fired on, and the `_is_delayed` helper;
* `../frontend/src/format.ts`: `SIGNAL_THRESHOLD`, used to draw the filled cap
  on the signal meter.

And after changing `prepare_data.py` you must **re-run it**, or the served data
will still be the old scores.

---

## 7b. The Isolation Forest

`app/anomaly.py` scores every sanctioned work with the Isolation Forest the
team trained. It is a second opinion, kept separate from the review priority.

**What it is.** An unsupervised model. Nobody labelled any work as good or bad.
It learns what an ordinary work looks like across five numbers (the approved
amount, how much has been paid, how many payments, the gap between
recommendation and sanction, and the age since sanction) and reports how far
each work sits from that pattern, as a number from 0 to 100.

**Why it is not part of the score.** The review priority is built from four
rule checks and every point of it can be traced to a sentence on screen. The
model cannot explain itself that way. Mixing it in would spoil the property
that makes the score useful, so it sits in its own panel and is labelled as a
prompt to look again, not as evidence.

| File | What it is |
|---|---|
| `analysis/train.py` | The team's training script, unchanged. Needs scikit-learn, numpy and scipy. You only run this if you retrain. |
| `analysis/model-card.json` | What the model is, what it was trained on, and what it does not claim. |
| `data/model.json` | The trained forest, exported as plain JSON. |
| `app/anomaly.py` | Scoring, in the standard library only. |

**Why scikit-learn is not in `requirements.txt`.** Scoring a trained forest
means walking a few hundred small decision trees, which needs no libraries.
Adding scikit-learn, numpy and scipy would put about 100 MB on every laptop
that runs this project, to do arithmetic that fits on one screen.

**How we know the Python scoring is correct.** The exported model was
originally scored by JavaScript. We rewrote it in Python and then scored all
2,437 training works with both, comparing every result. All 2,437 matched
exactly, to the last decimal place. The smoke test checks the score is present
and within range on every run.

## 8. Using Supabase instead of SQLite (optional)

You do not need this. It exists because the team's original code used Supabase
(a hosted PostgreSQL database), and the demo must keep working without it.

**Read this first:** as the code stands today, setting `DATA_BACKEND=supabase`
does **not** change where the running API reads or writes. `app/store.py`
always uses `data/projects.json` plus local SQLite; the setting only changes one
line in the startup log. `scripts/sync_supabase.py` is a genuine one-way upload
(local files → Supabase tables), and `scripts/schema.sql` genuinely creates the
tables. So today Supabase is a **mirror for demonstration**, not a live backend.
If you tell a judge "we run on Supabase", be ready for that question.

To set the mirror up:

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the whole of `scripts/schema.sql`,
   and press Run. It is safe to run more than once, because every statement uses
   `IF NOT EXISTS`.
3. Copy `.env.example` to `.env` and fill in:
   ```
   DATA_BACKEND=supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-key
   ```
4. Make sure steps 4 and 5 of the setup have already been run, so
   `data/projects.json` and the SQLite accounts exist.
5. See what would be uploaded, without sending anything:
   ```bash
   python scripts/sync_supabase.py --dry-run
   ```
6. Actually upload:
   ```bash
   python scripts/sync_supabase.py
   ```
   It uploads in batches of 200 and prints progress. Every write is an *upsert*
   (insert or update on the primary key), so running it twice changes nothing
   the second time. If it fails halfway, run it again. At the end it reads
   the row counts back from Supabase as a check.

Passwords are uploaded only as salted hashes. The plain demo password is never
sent.

**Security warning, worth knowing before anyone asks.** The row-level security
policies in `schema.sql` are commented out on purpose for the demo. That means
anyone holding the Supabase key can read and write every row; all the role
restrictions live in the FastAPI layer and are bypassed by talking to the
database directly. That is acceptable for a public MPLADS extract with a shared
printed password, and unacceptable in production. `schema.sql` explains this at
length near the bottom. Read it before answering a question about it.

---

## 9. Troubleshooting

### "Address already in use" / port 8000 is already taken

Something else (often an earlier copy of this server) is on port 8000.

Find and stop it:

```bash
# macOS / Linux
lsof -ti :8000 | xargs kill

# Windows
netstat -ano | findstr :8000
taskkill /PID <the number from the last column> /F
```

Or use a different port:

```bash
uvicorn app.main:app --reload --port 8001
```

If you change the port you must also tell the frontend where to find the API.
See the frontend README's section on `VITE_API_BASE`. Add the frontend's
address to `CORS_ORIGINS` as well if that changed too.

### "data/projects.json not found. Run: python scripts/prepare_data.py"

Exactly what it says: step 4 of the setup was never run, or was run from the
wrong folder. Run it **from inside the `backend` folder**:

```bash
python scripts/prepare_data.py
```

If that fails with `missing source file: .../data/source/xxx.csv`, the raw CSV
inputs are not there. They are part of the repository, so check you cloned or
copied the whole `data/source/` folder.

### CORS errors in the browser console

The message looks like *"has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present"*. CORS (Cross-Origin Resource
Sharing) is the browser rule that a page served from one address may only call
another address if that other address says it is allowed.

The API allows these four addresses by default:
`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`,
`http://127.0.0.1:4173`.

So:

* Open the site at `http://localhost:5173`, not at some other port and not by
  double-clicking the HTML file.
* `localhost` and `127.0.0.1` are treated as *different* addresses by this
  rule. Both are in the list, but pick one and stay with it.
* If you are serving the frontend from anywhere else, add it in `.env`:
  ```
  CORS_ORIGINS=http://localhost:5173,http://192.168.1.20:5173
  ```
  then restart the server. Editing `.env` does not reload by itself.

### No accounts, or login always fails

Symptoms: "Incorrect username or password" for every account, or
`/api/health` reporting `"accounts": 0`.

1. Check the account count: open <http://localhost:8000/api/health>.
2. If it is 0, run `python scripts/seed_users.py`. (The server also tries to do
   this by itself on startup when the table is empty. Look in the server's
   terminal output for a line beginning `no accounts found`, or for a message
   saying the automatic seeding failed.)
3. Check the username. Open <http://localhost:8000/api/auth/demo-accounts> for
   twelve real ones, or scroll the output of `seed_users.py`. (That address
   returns 404 if `DEMO_ACCOUNTS=off`.) Usernames are always
   lowercase; leading and trailing spaces are stripped, so a stray space is not
   the problem, but a wrong middle name is. It is `sanjay.jadhav`, not
   `sanjayjadhav`.
4. The password is `nigrani` for every account, unless someone set
   `DEMO_PASSWORD` in `.env`, in which case the accounts were seeded with
   *that* password. Changing `DEMO_PASSWORD` afterwards does not change existing
   accounts; re-run `seed_users.py` to reset them all.
5. Last resort: delete `data/sns.sqlite3` (plus the `-wal` and `-shm` files)
   and run `python scripts/seed_users.py` again. This also deletes every
   work-log entry anyone has added. If you set `SNS_DB`, delete the file it
   points at instead.

### "Your session has expired. Sign in again."

Tokens last 12 hours by default. Also, the signing key lives in `SECRET_KEY`;
if someone changes it in `.env`, every existing token stops working at once.
Sign in again.

### `uvicorn: command not found`

The virtual environment is not active in this terminal. Run the activate
command from step 2 again. Every new terminal window needs it.

### `ModuleNotFoundError: No module named 'app'`

You are running the command from the wrong folder. `uvicorn app.main:app` must
be run from inside `backend/`, the folder that contains the `app` directory.

### Everything returns "Something went wrong on the server"

That is the deliberate catch-all: the API never shows a stack trace to the
browser during a live demo. The real error, with its full trace, is printed in
the terminal where uvicorn is running. Look there.
