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
