# Smart Nigrani System frontend (SIH26102)

This folder holds the **website**: the screens a Member of Parliament or a
contractor actually looks at. It is written in **React**
(a JavaScript library for building user interfaces) with **TypeScript** (plain
JavaScript plus type checking, so mistakes show up while you write instead of
in the browser) and is built and served by **Vite** (the tool that runs the
development server and packages the site for release).

---

## 1. What this is

The website draws everything from the backend API in `../backend`. It holds no
data of its own. There is no copy of the 4,807 MPLADS records and no
hardcoded numbers on the landing page. Every figure on screen came from an HTTP request.

**MPLADS** stands for *Members of Parliament Local Area Development Scheme*:
each MP gets a yearly budget to recommend small public works in their
constituency. This system monitors 4,807 such works from Maharashtra, scores
each one for how urgently a human should review it, and gives contractors a
place to record progress.

What is worth knowing about how it was built, because a judge will ask:

* **No UI component library.** No Material UI, no Bootstrap, no Tailwind. Every
  button, panel, table and badge is written in this repository, in
  `src/styles.css`.
* **Charts are hand-written SVG.** No charting library. A charting library costs
  over 100 KB compressed and still needs fighting to look like anything but a
  demo; these are a few hundred bytes each and paint instantly. See
  `src/components/Charts.tsx`.
* **No routing library.** With four destinations, routing is a small piece of
  state in `src/App.tsx` instead of a dependency.
* **The map is Leaflet with OpenStreetMap tiles.** Leaflet is the only large
  dependency, and it is split into its own file at build time so that editing a
  component does not force the browser to download the map code again.
* **Two themes.** Light is the default and dark is a button in the header. See
  section 7.
* The whole packaged site is small. `npm run build` prints the exact file sizes
  for the current code, including the gzip figure, so read the number off that
  rather than quoting one from memory.

The whole runtime dependency list is React, React DOM and Leaflet. That is all
of it; see `package.json`.

There are only two folders of files that ship with the site: `src/` (the code)
and `public/`, which holds one file, `favicon.svg`. There is no `src/assets/`
folder. If a document or a tutorial tells you to put an image there, it is out
of date.

**The backend must be running before this shows any data.** Start
`../backend` first; the instructions are in its own README. Without it, the
landing page and the sign-in screen still render, but every panel shows
*"Cannot reach the API…"*.

---

## 2. What you need installed

| Thing | Version | How to check |
| --- | --- | --- |
| Node.js | **20 or newer** (Vite 8 requires it) | `node --version` |
| npm | comes with Node.js | `npm --version` |

Download Node.js from <https://nodejs.org> and take the LTS version. Nothing
else is needed on this side: no Python, no global installs.

---

## 2b. The addresses

The site is a single page. The part of the address after the `#` decides which
screen you see, so each screen has its own link you can paste into the address
bar, and the browser back button works.

| Address | Screen | File |
|---|---|---|
| `/#/` | Public front page | `src/pages/Landing.tsx` |
| `/#/signin` | Sign in | `src/pages/Login.tsx` |
| `/#/dashboard` | Dashboard for whoever is signed in | `src/pages/MpDashboard.tsx` or `src/pages/VendorDashboard.tsx` |

Opening `/#/dashboard` without being signed in sends you back to `/#/`.

The `#` is used instead of ordinary paths (`/signin`) on purpose. With ordinary
paths, reloading the page on `/signin` asks the server for a file at that
address, which does not exist, and you get a 404. Everything after a `#` is
handled by the browser and never sent to the server, so reloading and sharing
links both work with no server settings to change.

## 3. Setup steps

Run these from **inside this `frontend` folder**.

### Step 1. Start the backend first

In a separate terminal, follow `../backend/README.md`. You want
`uvicorn app.main:app --reload --port 8000` running and
<http://localhost:8000/api/health> answering. Leave it running.

### Step 2. Install the packages

```bash
npm install
```

This reads `package.json`, downloads React, Leaflet and the build tools into a
`node_modules` folder, and takes a minute or two the first time. You only need
to do it again when `package.json` changes.

### Step 3. Start the development server

```bash
npm run dev
```

Then open <http://localhost:5173>.

The port is **fixed** at 5173 on purpose (`strictPort: true` in
`vite.config.ts`). Vite would normally slide quietly to 5174 if 5173 were busy,
but the backend only allows calls from 5173 and 4173, so a silent move would
look exactly like the backend being down. If the port is taken, Vite now stops
with an error instead. See the troubleshooting section.

While `npm run dev` is running, saving a file updates the browser immediately.
Leave the terminal open; press `Ctrl+C` to stop.

### Step 4. Sign in

The quickest way in is the **sample accounts** on the sign-in screen. They are
fetched live from the API (`GET /api/auth/demo-accounts`), six for each role,
and the tabs at the top of the form choose which six you see. **Clicking one
signs you straight in.** No password is typed, and none is shown.

That is on purpose. The API no longer sends the shared password to the browser.
Clicking a sample account posts only the username to `POST
/api/auth/demo-login`, and the server answers with a session token. So the
password is never printed on screen and is not in the page source.

If you want to type an account in by hand, open the "Sign in with a username"
section below the samples. Every seeded account shares the password
**`nigrani`**:

| Username | Role | What you will see |
| --- | --- | --- |
| `sanjay.jadhav` | Member of Parliament | Only the works this MP recommended |
| `vendor.jalna` | Contractor / vendor | Only Jalna district; can add work-log entries |

If the backend is started with `DEMO_ACCOUNTS=off`, the sample list is gone and
the screen says so. Typing a username and password still works.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Type-checks the code, then packages the site into `dist/` |
| `npm run preview` | Serves the packaged `dist/` folder locally on port 4173, to check the real build |
| `npm run lint` | Runs oxlint, a fast code checker |

`npm run lint` currently prints some warnings and one error. The error is
oxlint mistaking `useSample` in `src/pages/Login.tsx` for a React hook because
of its name; it is an ordinary function. Nothing there stops the site building
or running. `npm run build` is the command that must stay clean.

---

## 4. Pointing it at a different API address

By default the site calls `http://127.0.0.1:8000`. That default lives in
`src/api.ts`.

To change it, create a file named **`.env`** in this folder (the same folder as
`package.json`) containing:

```
VITE_API_BASE=http://localhost:8001
```

Then **stop and restart `npm run dev`**. Environment variables are read when
the server starts; saving the file is not enough.

Rules worth knowing:

* The name must begin with `VITE_`. Vite deliberately refuses to expose any
  other variable to browser code, so a variable called `API_BASE` would be
  ignored.
* Do not put a trailing slash, though `src/api.ts` strips one if you do.
* Whatever address you point at, that backend must list **this** site's address
  in its `CORS_ORIGINS` setting, or the browser will block the calls. See the
  backend README.
* `.env` is already in `.gitignore`, so your local override is not committed.

Common uses: the backend is on a different port; the backend runs on a
teammate's laptop (`VITE_API_BASE=http://192.168.1.20:8000`); the backend is
deployed somewhere public.

---

## 5. What every file in `src/` does

| File | What it does |
| --- | --- |
| `main.tsx` | The entry point. Mounts React into `index.html`. Imports Leaflet's stylesheet **before** `styles.css`, deliberately, because that ordering is what lets the dark map overrides win without `!important` everywhere. |
| `App.tsx` | The app shell. Decides what you see: still checking your session, the landing page, the sign-in screen, or, once signed in, the vendor dashboard for a `vendor` and the MP dashboard for everyone else. Wraps everything in `ThemeProvider` and `AuthProvider`. Also holds the top bar (with the theme toggle and the sign-out button) and opens and closes the project detail panel. |
| `auth.tsx` | Session state: who is signed in, sign in, sign out. `signIn` takes a username and password; `signInAsDemo` takes a username only and uses the sample sign-in route. On page load it tries to resume a saved session. When any request comes back 401 (not signed in) it drops the whole app back to the sign-in screen. |
| `theme.tsx` | The light and dark themes. Holds which theme is active, writes `data-theme="light"` or `data-theme="dark"` onto the page's root element, remembers the choice in `localStorage` under the key `sns.theme`, and exports the `ThemeToggle` button. Also exports `cssColour()`, which reads a CSS variable and gives back the real colour it currently resolves to. The map needs that; see section 7. |
| `api.ts` | The only file that calls `fetch`. Builds query strings, attaches the session token, converts the backend's error shapes into readable sentences, and stores the token in the browser's `localStorage` under the key `sns.token`. Also handles the awkward part: MPLADS project ids contain slashes (`WS/MP681/2024-2025/143652`), so each segment is escaped separately to keep the slashes as real path separators. |
| `types.ts` | The TypeScript shapes of everything the API returns, in one place. If the backend changes a field name, you get a compile error here instead of a blank panel in the browser. |
| `format.ts` | Formatting and shared constants. Money is shown the way an Indian official reads it, as `₹8.15 Cr` or `₹30 L`, not as `₹81,454,456`. Also holds date and duration formatting, the risk and detector colours (`RISK_COLOR`, `RISK_VAR`, `SIGNAL_COLOR`, all of which hold **CSS variable names, not hex codes**, see section 7), the detector labels, and the detector thresholds (`SIGNAL_THRESHOLD`, which must match the Python pipeline). |
| `hooks.ts` | Three small reusable pieces of behaviour. `useAsync` loads data and cancels the previous request when the inputs change (without it, a slow early search response can land after a fast later one and overwrite it). `useDebounced` waits until typing pauses before searching. `useEscape` closes the detail panel on the Escape key. |
| `styles.css` | The whole design system: **every colour in the project**, in both themes, plus typography and every component class (`.btn`, `.panel`, `.table`, `.sev-*`, and so on). Also the layout classes that size the dashboard to the window (section 8), the dark-theme overrides for Leaflet, and the responsive rules. |
| `components/Charts.tsx` | The charts, hand-written as SVG: `Stat` (a KPI tile), `RiskStrip` (the stacked bar of Critical/High/Medium/Routine), `BarList` (horizontal bars with values written on them), `DistrictTable`, `SignalBars`, `UtilisationMeter`, and `Empty` (the placeholder when there is nothing to show). Every bar carries its value as a printed label, so nothing depends on hovering, which means it survives a projector and a screenshot in a slide deck. |
| `components/MapPanel.tsx` | The Leaflet map, plus `MapLegend`. Uses Leaflet directly rather than a React wrapper. Markers are drawn onto a canvas rather than as page elements, because a member with works across several districts can put hundreds on screen at once and page elements make panning visibly stutter. Markers are drawn highest-risk last so critical pins sit on top. It redraws the markers whenever the theme changes, using the `version` number from `theme.tsx`. |
| `components/Signal.tsx` | The signal meter, the piece meant to make the interface memorable. Instead of hiding the four check scores behind one number, it draws all four as small stacked segments: colour says which detector, length says how strongly it fired, a filled cap says it crossed its threshold. Also `RiskBadge`, `SignalLegend` and `SignalRow`. |
| `pages/Landing.tsx` | The public landing page (and the `Wordmark` logo used in every header). Reads `/api/meta` and `/api/public/highlights`. |
| `pages/Login.tsx` | The sign-in screen, the sample-account list, and the one-click sample sign-in. |
| `pages/MpDashboard.tsx` | The dashboard an MP sees. |
| `pages/VendorDashboard.tsx` | The dashboard for contractor accounts. |
| `pages/ProjectDetail.tsx` | The panel that slides in when you click any project, from any screen. |

Files outside `src/` you may need: `index.html` (the page title and the font
preconnect), `vite.config.ts` (port and build settings), `package.json` (the
commands and the dependency list), `tsconfig*.json` (TypeScript settings),
`.oxlintrc.json` (code-checker rules), and `public/favicon.svg` (the small icon
in the browser tab, and the only file in `public/`).

### What the browser stores

The site keeps two values in `localStorage`, which is a small store the browser
keeps for one website and does not clear when you close the tab.

| Key | What it holds | Set in |
| --- | --- | --- |
| `sns.token` | Your session token, so a page refresh does not sign you out | `src/api.ts` |
| `sns.theme` | `light` or `dark`, so your theme choice is remembered | `src/theme.tsx` |

Nothing else is stored. Both reads and writes are wrapped in `try`/`catch`,
because a private-browsing window can refuse storage access. When that happens
the site stays signed out and light rather than crashing.

---

## 6. The three screens

### Screen 1. Landing page (`pages/Landing.tsx`)

The public page, shown before anyone signs in. No account needed.

It calls two endpoints, neither of which needs an account:

| Call | What it fills in |
| --- | --- |
| `GET /api/meta` | The headline numbers (total works, members, constituencies, districts, snapshot year), an explanation of each of the four checks, where the source data comes from, and the known limits of the analysis (for example, that the map pins are district-level approximations because the source files contain no work-site coordinates) |
| `GET /api/public/highlights?limit=3` | Three real flagged works, with their risk badge, signal meter, budget, district, stage, and the sentences saying why each was flagged |

Those three works are **not examples typed into the page**. They are the three
highest-scoring works in the live dataset, ranked by the same score the
dashboard uses. The API leaves the MP's name out of this response on purpose,
because the page needs no sign-in, so each work is shown by its short reference
(for example `SNS-2232`) instead.

The numbers here come from the same API the dashboards use, so the front page
cannot drift out of date the way hardcoded figures do. The "Sign in" button
leads to `pages/Login.tsx`. If the API cannot be reached the page still
renders, shows "Cannot reach the data server" with the command that starts it,
and falls back to the figures written into the code.

### Screen 2. MP dashboard (`pages/MpDashboard.tsx`)

Shown to `mp` accounts. The member sees only the works they recommended, and
that limit is applied by the server, not by hiding rows in the browser, so it
holds even if someone edits the page or calls the API directly.

At the top, a strip of six headline numbers: Projects, Need a look, Running
late, Finished, Money approved, and Money paid out (shown as a percentage of
the money approved, with the rupee figure underneath).

Below that, three tabs:

* **Map and list.** The map on one side and the project list on the other, both
  driven by *one* set of filters (search text, district, stage, attention
  level), so narrowing the list narrows the map at the same time. Two panes
  showing different subsets of the same query is the fastest way to confuse
  someone in a live demo. Each row carries its risk badge and its four-segment
  signal meter. Clicking a row opens the project detail panel.
* **Needs attention.** The highest-priority records first, routine work
  excluded, each with the plain-English reasons it was flagged. This is the
  "what should I look at this morning" screen. The tab label carries the count.
* **Charts.** The aggregate charts: the mix of review priorities, budget
  utilisation, how many records each of the four checks fired on, works by
  stage, a district-by-district table of budget against money spent, and works
  by category.

### Screen 3. Vendor dashboard (`pages/VendorDashboard.tsx`)

Shown to `vendor` (contractor) accounts. Deliberately much simpler: a
contractor standing on a site does not need a risk analysis screen, they need
to find their project and record what they did.

Four headline numbers (Projects assigned to you, Finished, Money approved,
Being checked), a search box and a stage filter, and a plain list of the works
in this contractor's district, most recent first. Clicking one opens the same
project detail panel.

### The project detail panel (`pages/ProjectDetail.tsx`)

Opened by clicking any project on screens 2 or 3. Closes with the Escape key.
It has three tabs:

* **Work log.** The Sr No / Work / Cost / Date table. A vendor also gets the
  "Add work" form here, and can delete a row they added themselves (the undo for
  a mistyped entry). An MP can read this table but cannot write to it; that rule
  is enforced by the server, not by hiding the button. If the logged spend
  passes the sanctioned budget the entry is still saved and a warning is shown.
  Recording overspend is the point of the system, not something to block.
* **Why flagged.** Each check that fired, with its score and the sentence
  explaining it, the peer-cost comparison, and a link to the matching record
  when the "looks like another work" check found one (only when that other
  record is inside your own scope).
* **All details.** The raw MPLADS fields: dates, amounts, agency, stage.

The first two tab labels carry a count in brackets when there is something to
count.

---

## 7. Themes and colours

### The two themes

There is a **light theme** and a **dark theme**. Light is the default, and dark
is the small sun/moon button in the header. The button is also on the sign-in
screen and the landing page.

The code is in `src/theme.tsx`. It does four things:

1. Holds which theme is active, starting from light.
2. Writes `data-theme="light"` or `data-theme="dark"` onto the page's root
   element, which is what the stylesheet reacts to.
3. Saves the choice in `localStorage` under the key `sns.theme`, so it survives
   a reload.
4. Counts theme changes in a number called `version`. The map watches that
   number and repaints its markers when it changes, because markers painted on
   a canvas cannot pick up new CSS on their own.

Light is the default even for someone whose computer is set to dark mode. That
is deliberate: this is a public dashboard, and light is the safer look on a
projector or a printed page.

### Changing the colours

**Every colour in the project is defined in one file: `src/styles.css`.** There
is nowhere else to look.

That file has two blocks of colour variables near the top:

| Block | Selector | Used when |
| --- | --- | --- |
| Light | `:root` | Always, as the starting point |
| Dark | `[data-theme='dark']` | Only when the dark theme is on |

The dark block lists the same variable names again with different values, and
overrides the light ones. So **to change a colour properly you must change it
in both blocks.** Change only `:root` and the dark theme keeps the old colour.

The one exception is the four detector colours (`--sig-cost`,
`--sig-duplicate`, `--sig-delay`, `--sig-payment`). One set serves both themes,
so they appear in the light block only. That is checked, not an oversight: the
comments in `styles.css` record the contrast measurements against both the
white and the dark surface.

A quick tour of the variables. Every one below is defined in both blocks except
the four `--sig-*` colours, for the reason above.

```css
:root {
  /* surfaces, from the page upward */
  --page: #f4f6f8;
  --sunken: #eceff3;
  --panel: #ffffff;
  --raised: #f7f9fb;
  --hover: #eef2f6;

  /* lines */
  --rule: #e0e5ec;
  --rule-strong: #c9d1dc;

  /* text */
  --text: #161a20;
  --text-dim: #576172;
  --text-faint: #858f9f;

  /* severity: Critical / High / Medium / Routine.
     Each one has a matching -soft (a background) and -line (a border). */
  --critical: #bd3743;
  --high: #e16c10;
  --medium: #b08300;
  --routine: #6b7688;

  /* the colour used for anything clickable */
  --accent: #1668a8;

  /* one colour per check, used by the signal meter */
  --sig-cost: #c96dad;
  --sig-duplicate: #259cde;
  --sig-delay: #c8800d;
  --sig-payment: #0d9488;
}
```

### Correction to an earlier version of this README

An older version of this file said `RISK_COLOR` and `SIGNAL_COLOR` in
`src/format.ts` were a second copy of these hex codes, and that you had to
change the colour in two places. **That is no longer true.** Those maps now
hold CSS variable names, not colours:

```ts
export const RISK_COLOR: Record<RiskLabel, string> = {
  'Critical Review': 'var(--critical)',
  'High Review': 'var(--high)',
  'Medium Review': 'var(--medium)',
  Routine: 'var(--routine)',
}

export const SIGNAL_COLOR: Record<SignalKey, string> = {
  cost: 'var(--sig-cost)',
  duplicate: 'var(--sig-duplicate)',
  delay: 'var(--sig-delay)',
  payment: 'var(--sig-payment)',
}
```

Anything that renders HTML (a chart bar, a badge, the signal meter) can use
`var(--critical)` in an inline style, and the browser resolves it. So those
colours follow the theme by themselves.

The map is the one thing that cannot do this. It paints its markers onto an
HTML `<canvas>` element, and a canvas needs a real colour value such as
`#bd3743`; hand it `var(--critical)` and it silently draws black. That is what
`RISK_VAR` and `cssColour()` are for:

* `RISK_VAR` holds the bare variable **name**, for example `--critical`.
* `cssColour('--critical')` in `src/theme.tsx` asks the browser what that
  variable is worth right now and returns the real colour.

So the map reads the same stylesheet as everything else, one step later, rather
than keeping its own copy that would drift out of step and could not follow a
theme change at all.

The `.sev-critical`, `.sev-high`, `.sev-medium` and `.sev-routine` classes
further down `styles.css` use `var(--critical)`, `var(--critical-soft)` and
`var(--critical-line)` as well, so they need no separate edit either.

**In short: change a colour in `src/styles.css`, in both the light block and
the dark block, and you are done.**

A note before you change the severity colours at all. Each theme's four were
picked as an ordered scale, and they run in opposite directions on purpose: on
the light page darker means more urgent, on the dark page lighter means more
urgent. They were checked for contrast and for how far apart they look,
including for people with colour blindness, and the comments in `styles.css`
record the measurements. Routine deliberately sits outside the warm scale, low
in colour and cool, because "nothing to do here" should never compete for
attention. Severity is also never shown by colour alone: every badge carries a
text label.

---

## 8. Why the dashboard fits the window

On the MP dashboard's map tab, the two panes are sized to the browser window.
They scroll inside themselves, and the page as a whole does not. Before this,
the map and the project list ran off the bottom of the screen and looked cut
off, which was worse on a 13 inch laptop than on a large monitor.

Five CSS classes in `src/styles.css` do this:

| Class | What it does | Where it is used |
| --- | --- | --- |
| `.app-shell` | The outer box. A flex column, exactly `100dvh` tall (the height of the visible window), with anything past that hidden | `src/App.tsx` |
| `.app-body` | The area below the header. Takes the leftover height, and scrolls if its contents are taller | `src/App.tsx` |
| `.dash` | One dashboard. A flex column inside `.app-body` | `src/pages/MpDashboard.tsx` |
| `.dash-locked` | Added to `.dash` on the map tab only, and only when the window is at least 700px tall. This is what holds the two panes to the screen | `src/pages/MpDashboard.tsx` |
| `.scroll-fill` | Put on a panel's inner area: fill the height left over, and scroll inside yourself | `src/pages/MpDashboard.tsx` |

One more class, `.monitor-fill`, sits between `.dash-locked` and the two panes
and is part of the same chain.

The vendor dashboard does not use any of these. It is a single column that
scrolls inside `.app-body` in the ordinary way.

**The rule that matters if you edit this.** Every element in that chain has to
be a flex item with `min-height: 0`. Miss one link and the whole thing breaks:
a flex item will not shrink below the height of its own contents unless you
tell it to, so the panel grows to fit all of its rows and runs off the bottom
of the screen. The symptom looks like a CSS bug at the very bottom of the page,
but the cause is usually a missing `min-height: 0` several levels up.

`.dash-locked` is switched off below 700px of window height, on purpose.
Squeezing a map and a list into 500px would leave both unusable, so on a short
window the page scrolls normally instead.

---

## 9. Building for production

```bash
npm run build
```

This first type-checks the whole project (`tsc -b`) and then packages it. **The
build fails if there is a TypeScript error**, and that is intended. A type error
is a bug you would otherwise meet on stage. The output lands in a `dist/`
folder as plain HTML, CSS and JavaScript files.

Leaflet and React are split into their own files (see `vite.config.ts`), so a
change to a component does not invalidate the map code in visitors' browser
caches.

To check the real build before deploying:

```bash
npm run preview
```

That serves `dist/` at <http://localhost:4173>. The backend already allows port
4173, so this works out of the box.

`dist/` is a folder of static files. It can be hosted on Netlify, Vercel,
GitHub Pages, or any plain web server. Two things to remember when you do:

1. Set `VITE_API_BASE` **before** running `npm run build`. The value is baked
   into the packaged files; changing `.env` afterwards does nothing.
2. Add the site's public address to `CORS_ORIGINS` on the backend, or the
   browser will block every API call.

---

## 10. Troubleshooting

### Blank white page

1. Open the browser's developer tools (F12, or right-click → Inspect) and look
   at the **Console** tab. A blank page almost always means one JavaScript
   error, and it is named there.
2. Check the terminal running `npm run dev` for a red error. A TypeScript or
   import error stops the page from rendering at all.
3. If it happened right after `git pull`, someone probably added a package:
   run `npm install` again.
4. If the console mentions `localStorage`, a stale or corrupt session token can
   be the cause. In the developer tools, open Application → Local Storage,
   delete the `sns.token` entry, and reload. (Private-browsing windows
   can also refuse storage access; the code already handles that by staying
   signed out rather than crashing.)
5. Truly stuck: delete `node_modules` and reinstall.
   ```bash
   rm -rf node_modules
   npm install
   ```

### "Cannot reach the API at http://127.0.0.1:8000. Is the backend running?"

That exact sentence comes from `src/api.ts`, and it means the request never
reached a server.

1. Is the backend running? Open <http://localhost:8000/api/health> directly. If
   that fails too, the problem is entirely on the backend side. See
   `../backend/README.md`.
2. Is it on the port the message names? If you started uvicorn on a different
   port, set `VITE_API_BASE` (section 4) and restart `npm run dev`.
3. Look at the browser console for a **CORS** message instead. That is a
   different failure with a similar symptom. CORS (Cross-Origin Resource
   Sharing) is the browser rule that a page served from one address may only
   call another address if that other address allows it. Fix it by opening the
   site at `http://localhost:5173` (the backend's allowed list names
   `localhost:5173`, `127.0.0.1:5173`, `localhost:4173` and `127.0.0.1:4173`),
   or by adding your address to `CORS_ORIGINS` in `backend/.env` and restarting
   the backend.
4. Note that `localhost` and `127.0.0.1` count as different addresses to the
   browser. Both are allowed, but be consistent.

### Port 5173 is already in use

Vite stops with an error rather than moving to another port, on purpose, because
the backend only allows 5173 and 4173.

Free the port:

```bash
# macOS / Linux
lsof -ti :5173 | xargs kill

# Windows
netstat -ano | findstr :5173
taskkill /PID <the number from the last column> /F
```

Usually it is an older `npm run dev` you forgot to stop, so check your other
terminal tabs first.

If you genuinely need a different port (`npm run dev -- --port 5174`), you must
also add `http://localhost:5174` to `CORS_ORIGINS` in `backend/.env` and
restart the backend, otherwise every API call is blocked.

### The map is grey, or has no map tiles

The map background images ("tiles") are fetched live from
`https://tile.openstreetmap.org`. The pins are drawn locally, so a common
symptom is coloured dots on an empty grey background.

1. **Check the internet connection.** This is the only part of the whole system
   that needs one. On conference or campus Wi-Fi with a sign-in portal, or
   behind a strict firewall, tiles are often blocked. Test by opening
   <https://tile.openstreetmap.org/5/23/13.png> in a tab. You should see a
   small map square.
2. **Before demo day, load the map once on the venue's network.** The browser
   caches tiles, so a map you have already panned around usually survives a
   network drop.
3. If the map area is the wrong size or only partly drawn after resizing the
   window or switching tabs, that is Leaflet needing a size recalculation.
   Reloading the page clears it.
4. If the pins are missing but the tiles are fine, the problem is data, not the
   map: check that the project list beside it has results, and remember the map
   only plots records that have coordinates.
