# Smart Nigrani System

**Problem statement SIH26102. MPLADS project monitoring.**

This file tells you how to run the project, what it does, and what to say when
someone asks you a hard question about it.

Read part 1 and part 2 tonight. Part 3 is only needed if you want the
project on the internet. The rest you can read after it is running.

### What came with this file

| File | What it is |
|---|---|
| `SmartNigraniSystem-Backend.zip` | The data server. Unzip it, follow part 1. |
| `SmartNigraniSystem-Frontend.zip` | The website. Unzip it next to the backend folder, so you end up with `backend` and `frontend` side by side. |
| `SIH-2026-Smart-Nigrani-System.pptx` | The six slide deck in the official SIH format, with real screenshots. Open it and fill in **Team ID** on slide 1, that is the only blank left. |
| `FEATURES.md` | Every screen and every button on the website, and what each one does. Read it once so nothing on screen can surprise you. |
| `screenshots/` | The fourteen screenshots used in the deck, in case you want them anywhere else. |
| `HANDOVER.md` | This file. |

---

## Part 1. Get it running

You need two things installed: **Python** (version 3.10 or newer) and **Node**
(version 20 or newer). Both work on a MacBook.

Check what you have:

```sh
python3 --version
node --version
```

You will use **two terminal windows**. One runs the data server, one runs the
website. Both need to stay open.

### Terminal 1: the data server

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The first three lines only need to be run once. After that, opening this
folder again only needs `source .venv/bin/activate` and the `uvicorn` line.

To check it worked, open <http://localhost:8000/api/health> in a browser. You
should see a line of text with `"ok":true` in it.

> **What is a virtual environment?** The `python3 -m venv .venv` line makes a
> private folder for this project's Python libraries, so installing them does
> not change anything else on your laptop. `source .venv/bin/activate` switches
> into it. You will see `(.venv)` appear at the start of your terminal prompt.

### Terminal 2: the website

```sh
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

`npm install` only needs to be run once and takes about a minute.

### Signing in

On the sign-in screen, click any sample account. It signs you straight in, no
password needed.

For the walkthrough in part 2, use these two:

| Account | Role | What they see |
|---|---|---|
| Sanjay Haribhau Jadhav | Member of Parliament | Parbhani. **Both Critical projects are here, so use this one.** |
| Jalna Works Contractor | Contractor | 58 projects in Jalna district |

Both appear on the sign-in screen. There are 47 MP accounts and 39 contractor
accounts in total.

If you ever need to type a password instead, open "Sign in with a username" and
the shared password is `nigrani`.

### The addresses to open

The site is one page, and the part after the `#` decides what you see. You can
paste any of these straight into the address bar, and the back button works.

| Address | What it shows |
|---|---|
| <http://localhost:5173/#/> | The public front page. No sign-in needed. |
| <http://localhost:5173/#/signin> | The sign-in screen with the sample accounts. |
| <http://localhost:5173/#/how-it-works> | The explainer page. The whole system in plain words with diagrams. No sign-in needed, and it also works while signed in. Good page to leave open before you start talking. |
| <http://localhost:5173/#/dashboard> | Your dashboard. Which one you get depends on the account: a Member of Parliament sees the map and list, a contractor sees their project list. If you are not signed in it sends you back to the front page. |

The project panel opens on top of the dashboard when you click a project, so it
has no address of its own.

For the server side:

| Address | What it shows |
|---|---|
| <http://localhost:8000/api/health> | One line saying the server is alive. Use this to check it started. |
| <http://localhost:8000/docs> | Every endpoint, with a Try it out button. FastAPI writes this page itself. Good to show a judge who asks about the API. |
| <http://localhost:8000/api/public/highlights> | The three flagged works the front page shows. No sign-in needed. |

### Check that everything works

```sh
cd backend
python scripts/smoke_test.py
```

This runs 29 checks against the server and prints a green PASS for each one.
If something is broken, it tells you which part. Run this the morning of the
presentation. It takes about five seconds and it will save you from a surprise.

---

## Part 2. The walkthrough

Ninety seconds. Do it in this order, because each step sets up the next one.

**1. The front page.**
Read the headline out loud: *"4,807 government projects. 264 worth checking."*
The photo beside it is a village road, the most common kind of work in this
data. Scroll on and there is a map with all 4,807 works as dots, the bright
ones being what the checks flagged.

Scroll down a little. The three projects shown are real, pulled live from the
data, with the real reasons they were flagged. Say: *"These are not examples we
wrote. This is what the system found."*

**2. Sign in as Sanjay Haribhau Jadhav.**
The map fills with his constituency. Red dots are the most serious.

**3. Click the top project in the list on the right.**
It is called *Construction of Sabha mandap at Bor Ranjani*.

**4. Click the "Why flagged" tab. This is the part that wins it.**

Read the three reasons out loud. They say, in plain words:

- No completion date has been recorded, and the work has been on the books for
  **759 days** since it was approved. The stage is still "Vendor
  Identification", which means a contractor has not even been chosen yet.
- **₹7.94 lakh of ₹7.99 lakh is already paid.** Almost all the money is gone,
  on a project where a contractor has not been picked.
- There is another work in the same district, under the same office, in the
  same year, with a **94% identical description**.

Then say the sentence that matters:

> *"The system never says fraud. It says: here is why a person should look, in
> three sentences."*

**5. Click "Needs attention".**
Twenty-four projects, each with its reasons written out. Say: *"This is one
officer's morning. Not 4,807 rows. Twenty-four."*

**6. Sign out. Sign in as Jalna Works Contractor.**
Completely different screen: a simple numbered list. Open any project, click
**Add Work**, type "Buy Cement", 300000, and today's date. Save it.

**7. Sign out. Sign in as Sanjay Haribhau Jadhav again.**
Find that same project. Your entry is there. There is **no Add Work button**,
because an MP watches, a contractor reports. Say: *"Same data, two roles, and
the rule is enforced on the server, not by hiding a button."*

**If someone asks whether it is live:** stop the data server in terminal 1 and
reload the page. It shows a clear error saying it cannot reach the server. It
is not a set of pictures.

**If someone asks what a button does:** it is in `FEATURES.md`, screen by
screen. Worth one read the night before, so nothing on your own screen can
surprise you in front of a judge.

**If someone asks how it works, in detail:** click **How it works** in the top
bar, or open <http://localhost:5173/#/how-it-works>. That page explains the
whole thing end to end with diagrams, in the same plain words, including the
four checks, how they add up to one number, and what the system deliberately
does not do. There is a menu across the top of that page, so you can jump
straight to the part a judge asked about instead of scrolling for it. It is
worth reading once yourself before the presentation, because every answer you
might need is on it. It is reachable signed in or signed out.

---

## Part 3. Putting it on the internet

You do **not** need this to present. The safest demo is the laptop in front of
you, because nothing on a stage depends on venue wifi. Read this only if you
want a link people can open from their own phones.

There are three ways, easiest first.

### Way 1: the same wifi, no accounts, two minutes

Everyone on the same wifi as your laptop can open it. Nothing gets uploaded
anywhere.

Find your laptop's address on the network:

```sh
ipconfig getifaddr en0
```

That prints something like `192.168.1.7`. Now start both servers so they listen
to the network instead of only to your own machine:

```sh
# terminal 1
uvicorn app.main:app --host 0.0.0.0 --port 8000

# terminal 2
npm run dev -- --host
```

One more step: the website needs to be told where the data server is, because
`127.0.0.1` means "this laptop" and on somebody else's phone that is *their*
phone. Make a file called `frontend/.env` with one line in it, using your own
address:

```
VITE_API_BASE=http://192.168.1.7:8000
```

Stop terminal 2 and start it again, then open `http://192.168.1.7:5173` on any
phone on that wifi.

If nothing loads, it is almost always the Mac firewall. System Settings,
Network, Firewall, allow incoming connections for Python and Node.

### Way 2: a real link on the internet, free, about thirty minutes

Two free services. The data server goes on **Render**, the website goes on
**Netlify**. Both have a free plan that needs no card.

Do them in this order. The order matters, because each one needs the address of
the one before it.

**Step 1. Put the code on GitHub.**

Render reads from a GitHub repository, so the backend has to be there. Make a
new repository, put the `backend` folder in it, and push.

**Step 2. The data server on Render.**

On render.com, New, Web Service, pick your repository. Then fill in:

| Field | What to type |
|---|---|
| Root directory | `backend` (skip this if the backend is the whole repository) |
| Runtime | Python 3 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance type | Free |

Then add these environment variables in the same form:

| Name | Value |
|---|---|
| `PYTHON_VERSION` | `3.11.9` |
| `SECRET_KEY` | any long random string of your own |
| `CORS_ORIGINS` | leave it out for now, step 4 fills it in |

Press Create. It takes three or four minutes. You end up with an address like
`https://smart-nigrani-api.onrender.com`. Open
`https://your-address.onrender.com/api/health` and you should see `"ok":true`.

**Step 3. The website on Netlify.**

First tell the website where its data server lives. Make a file
`frontend/.env` with one line:

```
VITE_API_BASE=https://your-address.onrender.com
```

This is read when you build, not when somebody visits, so it has to be written
before you build. Then build it:

```sh
cd frontend
npm run build
```

That makes a `frontend/dist` folder. On app.netlify.com there is a box that
says "drag and drop your site folder here". Drag `dist` onto it. That is the
whole deployment. You get an address like
`https://smart-nigrani.netlify.app`.

You do not need any redirect or rewrite file. The address of every screen is
after a `#`, and browsers never send that part to the server, so every page
works on a plain static host with no configuration.

**Step 4. Let the two talk to each other.**

Right now the data server will refuse the website, because a browser only lets
a page call a server that has said it is allowed to. Go back to Render, open
your service, Environment, and add:

| Name | Value |
|---|---|
| `CORS_ORIGINS` | `https://smart-nigrani.netlify.app` |

Use your real Netlify address, with `https://` and no slash at the end. Save.
Render restarts the service by itself. Wait a minute, then open your Netlify
link and sign in.

**Step 5. Check it.**

Open the site, sign in as an MP, open a project, open the "Why flagged" tab. If
the list loads but the panel does not, it is CORS. If nothing loads at all, the
Render service is still waking up.

### What is different once it is online

Three things change, and you should know them before somebody asks.

**It falls asleep.** A free Render service shuts down after fifteen minutes
with no visitors, and the next visit takes thirty to sixty seconds to wake it.
Open your own link two minutes before you present so it is already awake.

**Contractor entries do not survive a redeploy.** Work log entries are written
to a SQLite file that lives on the server's disk, and a free Render service
gets a fresh disk every time you deploy. Entries added through the website stay
until the next deploy, then go. Locally on your laptop they are permanent. If a
judge adds an entry during the demo, it will be there for the rest of the demo,
which is all that matters.

**The map pictures still come from OpenStreetMap.** That is the only outside
thing the site asks for, online or offline.

### Way 3: one command, if you already use Docker

There is no Dockerfile in the zip, because adding one the night before is a
good way to lose an evening. If you want one later, the backend needs Python
3.10 or newer, `pip install -r requirements.txt`, the `data` folder copied in,
and the same start command as above.

### Before you put it anywhere public

Do these three, they take two minutes together.

1. **Set `SECRET_KEY`** to a long random string. It signs the sign-in tokens.
   Anyone who knows the default can sign in as any account.
2. **Set `DEMO_ACCOUNTS=off`** if you do not want one-click sample sign-ins on
   a public site. Leave it on while judges are trying it, that is the point of
   it.
3. **Change the Supabase key** that was in the original backend zip. That zip
   has been sent around on chat, so treat the key as public. Change it in the
   Supabase dashboard.

---

## Part 4. What you should know about your own project

### The bug we found in your pipeline

Your `review_queue.csv` had **468,322 rows**, but there are only **2,431 real
projects**. Your stats endpoint was reporting "468,058 Routine projects".

Here is why. 2,377 rows of `master_projects.csv` have a **blank** `work_id`.
Those are recommendations that were never approved, so they never got an ID.
Some of the detector files have blank rows too. When pandas joins two tables on
a column, it treats blank as a real value and matches every blank to every
other blank:

```
2,377 blank rows x 7 x 4 x 7 = 465,892 rows that should not exist
```

That is exactly how many junk rows were in the file.

The new `scripts/prepare_data.py` joins only on real IDs and gives the
unapproved recommendations their own ID, so every project appears once.

**Your scoring is unchanged.** We copied your weights and cut-offs exactly. The
result still comes out as 4 Critical, 74 High and 186 Medium, the same as
yours. That match is the proof we fixed the duplication without touching your
analysis.

If a judge asks what was hard about the project, this is a good answer. You
found a real data bug and you can explain it.

### You do have a model, in fact two, and both are in the backend now

You said there was no model in the backend. There are two:

- **sentence-transformers.** This reads two project descriptions and decides
  they mean the same thing even when the words differ. It is what produces
  "94.3% description similarity". This is the most genuine machine learning in
  the project and it is worth talking about.
- **An Isolation Forest**, trained on 2,437 works. It was sitting in the
  *Frontend* zip (`analysis/train.py` and `data/model.json`), not the backend.
  That is why you thought it had gone missing. **It is now in the backend**, in
  `app/anomaly.py`, and its score appears on every project screen under "A
  second opinion from the model".

We did not retrain anything. Your training script is in `backend/analysis/`
unchanged, and we score using the model it already exported.

**How to answer "did you just copy it across?"** No. The exported model was
being scored by JavaScript in the website. We rewrote that scoring in Python so
it runs in the backend with the rest of the analysis, then checked the rewrite
by scoring all 2,437 works and comparing against the numbers scikit-learn
produced. **All 2,437 match to the last decimal place.** You can rerun that
check yourself, it is in the smoke test.

**Why there is no scikit-learn in requirements.txt.** Scoring a trained forest
is only walking a few hundred small decision trees, which needs no libraries.
Installing scikit-learn, numpy and scipy to do that would add about 100 MB to
every laptop that runs this. Training still needs them, and `analysis/train.py`
still imports them, but you only train once.

**What the model adds that the rules do not.** The rules and the model mostly
agree. But of the **24 works the model calls most unusual, 18 were marked
Routine by the rules**. Those are cases there is no rule for. That is the
honest argument for having both: rules explain themselves, the model catches
what nobody wrote a rule for. (Checked on the current data with:
`python3 -c` over `data/projects.json`, taking the top 1% by model percentile.)

### Why the website is new

The old one was made by ChatGPT's website builder. Three problems with it:

1. Its code was squashed onto single lines. One file was 26 KB on 21 lines.
   Nobody can edit that.
2. It only ran on Cloudflare, and its login only worked on ChatGPT's own
   hosting. On your laptop there was no way to sign in at all.
3. The public page showed **36 made-up projects and 3 invented MPs**. The real
   data page showed "Please sign in with ChatGPT" to everyone except you.

Fixing that would have taken longer than starting again, and it still would not
have run on your machine. The new website is ordinary React. `npm run dev` and
it works, on any laptop, with no account.

### Two gaps in the data, say these before a judge finds them

**1. There are no exact locations in the files.** Not one latitude or
longitude. Map dots are placed at the centre of the district, with a small
fixed offset so they do not sit on top of each other. The map says
"District-level approximation" in the corner at all times. If asked:

> *"MPLADS reports do not publish the location of each work. We place a work in
> its district and label it as approximate, rather than invent a precision we
> do not have."*

**2. The category column is unusable, so the sector is worked out from the
description.** 4,697 of the 4,807 works are filed under "Normal/Others", which
makes a chart of it meaningless. So each work is sorted into a kind of work
(roads, community halls, street lighting, and so on) by matching words in its
description. The rules are a readable list in `scripts/prepare_data.py`.

Say this plainly if asked: it is **derived, not published**. The screen says so
too. About 11% end up in "Other", which is honest for keyword matching on
messy text. It is deliberately not a machine learning classifier: for something
a judge may question, a list of words they can read beats an accuracy figure
they cannot check.

**3. There is no "percentage of work completed" figure.** So the comparison
your brief asks for, 80% of money spent against 30% of work done, cannot be
calculated from this data. The contractor work log is the honest replacement:
progress becomes something the contractor reports. That is also **why the
contractor role exists at all**, which is a better answer than a made-up
column.

---

## Part 5. Questions judges ask

**"Is this real data?"**
Yes. 4,807 works, 2,437 approvals and 1,730 payment records, from the five
public MPLADS reports for Maharashtra. 47 MPs, 47 constituencies, 39 districts.
The data is a snapshot from 9 September 2026.

**"How is the score calculated?"**
Four checks, each scoring 0 to 100. They are combined as cost 30%, repeated
work 25%, time taken 25%, money paid 20%. Every check that crosses its own line
adds 5 more points, up to three checks. 75 or more is Critical, 55 is High, 35
is Medium. The whole formula is printed on the screen inside the app, so
nothing is hidden.

**"Is this AI, or just if-else rules?"**
Both, on purpose. A sentence-transformer model finds works that mean the same
thing even when worded differently, which is what catches a repeat that a
keyword search would miss. Rules and statistics then turn those comparisons
into a score you can check by hand. A pure black box would be useless to an
officer who has to justify opening an investigation.

**"Can it be wrong?"**
Yes, and the app says so on screen: a flag means a person should check, not
that anything is wrong. A high score is a reason to look, never a conclusion.
That is the design, not an excuse.

**"Why only Maharashtra?"**
That is the data we were given. Nothing in the code is specific to
Maharashtra. Point `prepare_data.py` at another state's files and it works.

**"Your brief mentions district and ministry users. Where are they?"**
Left out on purpose. The two roles we built are the two with genuinely
different jobs, and data actually flows between them. A ministry view would be
the same screens with a bigger number on them. Adding it later is one rule in
`store.ProjectIndex.scoped()`.

**"Why is the map zoomed out for some MPs?"**
Because MPLADS lets an MP spend part of their money outside their own
constituency, and some do. Sign in as Aashtikar Patil Nagesh Bapurao of
Hingoli: **26 of his 117 works, 22%, are in Etah in Uttar Pradesh**, about 900
km away. The map zooms out to show all of them instead of quietly cutting a
fifth of his projects out of the picture. Use the district filter to narrow it.

That is a real finding the system surfaces without being asked. Worth
mentioning before anyone spots it.

**"Is anything about this insecure?"**
Three things were done on purpose:
- The sign-in screen never shows or downloads a password. Clicking a sample
  account signs you in through a separate route that only accepts the accounts
  already listed in public.
- The public front page shows real flagged works but **never an MP's name**,
  because that page needs no sign-in.
- What each role can see is decided on the server. Ask for a project outside
  your area and you get "not found", not a hidden button.

---

## Part 6. Where things are

```
backend/
  app/                the server
    main.py           starts everything, health check, dataset information
    store.py          reads the data, saves users and work entries
    security.py       password hashing and sign-in tokens
    anomaly.py        the Isolation Forest, scored here rather than in the browser
    deps.py           decides who is allowed to see what
    routers/          the web addresses: auth, public, projects, works, stats
  scripts/
    prepare_data.py     turns the CSV files into data/projects.json  (run first)
    seed_users.py       creates the 86 accounts
    seed_demo_works.py  adds a few sample contractor entries
    smoke_test.py       the 29 checks
    schema.sql          PostgreSQL tables, if you publish to Supabase
    sync_supabase.py    one way upload to Supabase
  data/source/        your original detector CSV files, untouched

frontend/
  src/
    api.ts            every call to the server, in one file
    auth.tsx          who is signed in
    theme.tsx         light and dark theme
    format.ts         rupees, dates, colours
    components/       the signal meter, the charts, the map, the flow diagrams
    pages/            Landing, Login, HowItWorks, MpDashboard, VendorDashboard,
                      ProjectDetail
    styles.css        every colour and spacing value in the whole app
```

Each file starts with a comment explaining what it is for. `backend/README.md`
and `frontend/README.md` go into more detail.

**About Supabase.** The app stores everything on your laptop, in a SQLite file
and a JSON file. It never talks to Supabase while running. `sync_supabase.py`
uploads a copy if you want one. So the true sentence is *"it runs locally and
can publish to Supabase"*, not *"it runs on Supabase"*. The smaller claim is
also the reason the demo cannot be broken by the venue wifi.

---

## Part 7. Things to do

**Tonight**
- Run both terminals and click through part 2 once, out loud, with a timer.
- Decide who drives the laptop and who talks.
- Run `python scripts/smoke_test.py` so you have seen it pass.

**Before you put this online anywhere**
- **Change the Supabase key.** The `.env` file in the backend zip you shared
  earlier has a live key in it, and that zip has been passed around on chat.
  Change it in the Supabase dashboard.
- Change `SECRET_KEY` in `backend/.env`. Anyone who knows it can create a valid
  sign-in for any account.
- Set `DEMO_ACCOUNTS=off` to remove the one-click sample sign-ins.

**About the photo on the front page**
It is a rural road through farmland in Maharashtra during the monsoon, on the
Bombay to Matheran route. Photographer McKay Savage, from Wikimedia Commons,
under a Creative Commons Attribution 2.0 licence. That licence lets anyone use
the picture for anything, including a competition entry, on two conditions:
credit the photographer, and say what you changed. Both are done. The credit
line sits under the picture on the website itself, and the changes we made
(cropped the flat grey sky off the top, lifted the contrast and colour a
little, resized) are written down in `frontend/public/images/CREDITS.txt`.
Nothing in the picture was added, removed or moved. If a judge asks where the
picture came from, that file is the answer.

**Say these out loud before a judge finds them**
- Map dots are at district level, not exact locations.
- Progress comes from contractor entries, not from the source data.
- Maharashtra only.
- The sample contractor entries that ship with it are made up, to give the
  screens something to show. To clear them:
  `sqlite3 backend/data/sns.sqlite3 "DELETE FROM work_logs;"`

---

## Part 8. If something breaks on the day

| What you see | What to do |
|---|---|
| "Cannot reach the data server" | Terminal 1 is not running. Start it. |
| `projects.json not found` | Run `python scripts/prepare_data.py` |
| Nobody can sign in | Run `python scripts/seed_users.py` |
| "Address already in use" on port 8000 | Something else is using it. Run `uvicorn app.main:app --port 8001`, then make a file `frontend/.env` containing `VITE_API_BASE=http://127.0.0.1:8001` and restart terminal 2. |
| The map is blank grey | No internet. Map pictures come from OpenStreetMap. Everything else still works. |
| Something is wrong and there is no time | Run `python scripts/smoke_test.py`. It tells you which part is broken in five seconds. |

**No internet at the venue?** Everything works except the map pictures. The
data is on the laptop. There is no cloud service and no API key anywhere.

---

You built something real here. The data bug you can explain, the model you
already had, and the three sentences on the "Why flagged" screen are the parts
worth being proud of. Good luck.
