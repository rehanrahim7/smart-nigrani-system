# Integration record: old site + new site → one Smart Nigrani System

This file records what was compared, what was kept, what was ported and why.
It was written before the code changes and updated as they landed.

- **New site** (`SmartNigraniSystem-SIH2026.zip`): FastAPI + SQLite backend, React/Vite frontend, token sign-in with MP and contractor roles, the team's four-check review priority, the Isolation Forest scored in Python. **This is the application.**
- **Old site** (`Site.zip`, legacy name NetraDrift): Next/vinext on Cloudflare D1, hosted-only sign-in, a 36-work synthetic public demo, a CSV research workspace, a delivery workflow, Gemini photo assessment. **Used as the source of features and visual direction only.**
- **Data** (`Data.7z`): the five MPLADS Maharashtra reports (byte-identical to the old site's copies) plus a cleaned master (2,437 works) and payment list (1,730 rows).

## 1. The ML model — what was found and what was done

| Item | Finding |
|---|---|
| Training script | `backend/analysis/train.py` — identical in both codebases. |
| Artifact | `backend/data/model.json` — byte-identical in both codebases. 160 trees, seed 42, trained on 2,437 sanctioned works. |
| Features, in order | `log1p(sanctioned amount)`, `successful paid / sanctioned`, `log1p(payment rows)`, `days recommendation→sanction`, `days sanction→2026-09-09`. |
| Preprocessing | median imputation → RobustScaler, both stored in the JSON (`medians`, `center`, `scale`); inputs rounded to float32 exactly as training did. |
| Inference | `backend/app/anomaly.py` (new site, Python). Verified: fed the training features it reproduces the scikit-learn score and percentile for **2,437 / 2,437** works. **Unchanged.** |
| Problem found | The new site built the five inputs from the detector pipeline's master file: ages counted to 8 Sep instead of 9 Sep, 7 sanctioned works lost (tabs inside their ids), 3 payments not attached. Result: **891 of 2,437 works got a score different from the model's own training output.** |
| Fix | Inputs now come from the original 5-report join (`app/pipeline.py`, a line-by-line port of the old `lib/pipeline.mjs`), which is the join the model was trained on. Parity is back to 2,437 / 2,437, checked by `scripts/verify_data.py`. |
| Reproducibility | Re-running the unchanged `train.py` with the pinned scikit-learn 1.8.0 / numpy 2.3.5 on this join reproduces every tree, median, centre and scale exactly; stored baseline scores differ only in the 16th decimal. |
| Separation | The model is not a term in the review priority. Shown as "statistical unusualness", with its limits, never as a fraud probability. |
| Old site's ML | Its JavaScript scorer computed the same numbers, but it also gave newly registered projects a score with zero payments and no interval, which the handoff itself calls misleading. That is **not** carried over: registered projects are marked "not scored by the model". |

## 2. The data

| Check | Result |
|---|---|
| Five reports → works | 9,929 source rows → **4,798 works** (2,437 sanctioned + 2,361 recommendations without an id). Snapshot **2026-09-09**. |
| Against the handoff summary | All 20 recorded totals match (₹2,345,613,683.87 sanctioned, ₹1,360,638,394 paid, 1,639 successful / 91 in-progress payments, 783 status differences, …). |
| Against the supplied cleaned master | Every field agrees for all 2,437 works except 3 payments whose ids contain whitespace; the report join attaches them, the cleaned file does not. Printed by `prepare_data.py` on every build. |
| Team's four-check detectors | Joined by work id (whitespace removed). 2,430 works carry scores; 7 blank-id detector rows cannot be tied to a work and are **not guessed** — those 7 show "Not checked". Priority distribution unchanged: 4 Critical, 74 High, 186 Medium. |
| Recommendations never sanctioned | Were shown as "Routine" in the new site. The four checks never ran on them, so they are now labelled **Not checked**. |

## 3. Feature inventory

| Feature | Old site | New site | Action |
|---|---|---|---|
| Real 4,798-work dataset + provenance | Research only (sign-in) | 4,807 via detector master | **Rebuilt from supplied reports**, provenance (file + row) kept per work and per payment |
| Four-check review priority | No | Yes | **Preserve** (formula, weights, wording unchanged) |
| Record checks (7 rules: peer total amount, similar description, sanction interval, age w/o completion, amount change, payment > sanction, date order) | Yes (research) | No | **Integrate** as "Record checks", separate from the priority |
| Isolation Forest | Correct model, JS scorer | Python scorer, wrong inputs | **Keep new scorer, fix inputs** (§1) |
| Splash / intro | Yes (session once) | No | **Integrate** |
| Animated landing, three-column | Yes (synthetic) | Static hero | **Integrate** old composition, on real data |
| MP-to-work network (projected 3D) | Yes (fictional MPs) | No | **Integrate** on real works, members shown as aliases publicly |
| Map | Hand-rolled tiles, synthetic points | Leaflet, district-level, labelled | **Keep new** |
| Public browse / search / filters / Apply / pages | Synthetic 36 works | Highlights only | **Integrate** on real data, anonymised |
| Work details, peers, investigation, timeline, duplicates | Synthetic | Drawer with 3 tabs | **Integrate** as tabs of one work view |
| Peer comparison animation | Yes | Numbers only | **Integrate** (real peer group: same agency, kind of work, sanction year) |
| Insights / method notes search | Yes (not RAG) | How it works page | **Merge**; method search stays labelled "not an AI assistant" |
| Public evidence demo (session cookie) | Yes | No | **Replaced** by the real evidence flow, reachable in one click with a sample field-officer account; public visitors cannot upload anonymously |
| Personas (citizen / MP / officer) | UI-only | Real sign-in (MP, contractor) | **Replaced by real roles**: MP, contractor, field officer, implementing agency, research analyst |
| Research workspace: datasets, history, switching, 5-CSV import, reviews, export, anonymised mode | Yes | No | **Integrate** (analyst role) |
| Delivery: team membership, project registration, assignments | Yes (email workspaces) | No | **Integrate** as the MP's team (agency adds contractors/officers, registers and assigns projects) |
| Contractor work log | Itemised expenses | Simple Work/Cost/Date | **Merge**: simple entry kept, itemised materials (qty/unit/rate/invoice), stage, progress, server totals, expense checks added |
| Field evidence: camera/upload, optional GPS, hash/reuse | Yes | No | **Integrate** |
| MP updates & alerts (polling) | Yes (30 s) | No | **Integrate**, labelled "checks every 30 seconds" |
| Review actions on submissions / review decisions | Yes | No | **Integrate** |
| Gemini visual assessment | Real endpoint, no key | No | **Integrate** with consent, server-side key, quota, honest unavailable state |
| Illustrative material-rate alerts | Demo only | No | **Not carried over** (not official rates). Replaced by a comparison with earlier claims for the same material and unit in this system |
| Sample-photo picker | Demo only | No | **Not carried over** as evidence; licensed photos stay as labelled illustrations only |
| RAG | Planned | No | Not implemented, not claimed |
| Dark mode | No | Yes | **Keep**, re-coloured for the warm theme |
| Visual style | Warm cream / burnt orange | Grey / blue | **Adopt old** |
| Logo | Eye icon, legacy name | Square icon | **New mark** |

## 4. Architecture decisions

- One backend (FastAPI), one frontend (React/Vite), one SQLite file. No Cloudflare, no hosted-only sign-in.
- Hash routing extended with query state (`#/works?sector=…&page=2`, `#/work/<id>/peers`), so refresh and back keep the screen, filters and selected work.
- Roles are enforced on the server. A contractor, field officer or agency account is never sent the four-check or model results.
- The public never sees a member's name or constituency next to a finding; members appear as `MP 01`…`MP 47`.
- Imported datasets are analysed with the same join, record checks and model; the four checks need the offline detector pipeline and are shown as not available rather than zero.

## 5. Verification at hand-over (27 Sep 2026)

| Check | Result |
|---|---|
| `backend/scripts/verify_data.py` (totals, ids, provenance, feature order, per-work model parity, priority counts) | 30 / 30 pass |
| `backend/scripts/test_workflows.py` (every workflow on a throwaway database) | 75 / 75 pass |
| `backend/scripts/smoke_test.py` against the running API | 31 / 31 pass (5 assertions updated for five roles and the "Not checked" label) |
| Retraining with the pinned libraries | identical trees, medians, centre, scale |
| Frontend `tsc -b` and `vite build` | pass |
| Frontend `oxlint` | 0 errors, 17 warnings (React style rules) |
| Browser, desktop, light and dark | public pages and every work tab; MP, contractor, officer, agency and analyst workspaces; contractor entry → member update → member action → contractor sees it; officer photo upload; draft restored after refresh; no console errors |
| Browser, 390 px wide frame | no page scrolls sideways; the one clipped table fixed |
| Not tested | a real Gemini response (no key), a real phone camera and GPS, the CSV import through the browser file picker (tested through the API) |
