# What the website can do

**Smart Nigrani System. Every screen, every button.**

`HANDOVER.md` tells you how to run the project and what to say on stage. This
file is different. It walks through every screen and says what each thing on it
does, so when a judge points at something and asks "what is that", you already
know.

You do not need to read this in one sitting. Find the screen you are looking at
and read that part.

---

## Contents

1. [Before you sign in](#1-before-you-sign-in)
2. [Signing in](#2-signing-in)
3. [The MP screen](#3-the-mp-screen)
4. [The contractor screen](#4-the-contractor-screen)
5. [The project panel](#5-the-project-panel)
6. [Things that are on every screen](#6-things-that-are-on-every-screen)
7. [Who is allowed to do what](#7-who-is-allowed-to-do-what)
8. [Quick answers](#8-quick-answers)

---

## 1. Before you sign in

Two pages are open to anybody. No account, no password.

### The front page

Address: <http://localhost:5173/#/>

| What is on it | What it does |
|---|---|
| The headline | "4,807 government projects. 264 worth checking." Both numbers are read from the server when the page opens. If the data changes, the headline changes. Nothing is typed in by hand. |
| The photo | A real road in rural Maharashtra. The credit and the licence are written under it. |
| Five stat tiles | Works in the record, members of parliament, constituencies, districts, and the year the data is from. |
| Three flagged works | Real records, pulled live, with the real reason each was flagged. These are not examples somebody wrote. |
| Kinds of work | A bar for each kind: community halls, roads, street lighting and so on, worked out from the descriptions. |
| The map | Every one of the 4,807 works as a dot, coloured by how much attention it needs. It behaves as a picture here: you cannot drag it or zoom it. Clicking it takes you to sign in. |
| Four checks | A short line on each of the four checks. |
| What this does not do | The limits, in plain words, read from the server so they cannot go stale. |

**One thing worth knowing.** This page never shows a member of parliament's
name. The works are public records, but putting a named person next to the word
"critical" on a page with no sign-in is a different thing, and this project does
not need to do it.

### How it works

Address: <http://localhost:5173/#/how-it-works>

The whole system explained end to end, with diagrams. Seven sections:

1. **The journey** - the six steps from government files to a ranked list.
2. **The data** - the five source files and how they are joined into one record.
3. **The four checks** - what each check asks, and an example of it firing.
4. **The score** - the weights, and the bands the final number falls into.
5. **The model** - what the Isolation Forest adds, and why it is kept separate.
6. **Two roles** - what an MP sees against what a contractor sees.
7. **Limits** - what the system cannot do.

There is a **menu across the top** that follows you down the page. Click any
item to jump straight to that section. The menu also highlights the section you
are currently reading, so you always know where you are. On a phone the menu
scrolls sideways and keeps the current item in view.

This page works signed in and signed out. Signed in, the button in the corner
says "Back to the dashboard" instead of "Sign in".

---

## 2. Signing in

Address: <http://localhost:5173/#/signin>

| What is on it | What it does |
|---|---|
| Two role tabs | **Member of Parliament** and **Contractor**. Picking one changes which sample accounts are offered. |
| Sample accounts | Six of each. Click one and you are signed straight in. No password typing. |
| "Sign in with a username" | Opens a normal username and password form, for showing that the real sign-in works. |

A session lasts **12 hours**, then you are signed out and have to sign in again.
The session is remembered if you reload the page or close the tab and come back.

The list of sample accounts never shows a password. The server will only accept
a one-click sign-in for accounts it has actually advertised; asking it for any
other account is refused.

---

## 3. The MP screen

This is what you get after signing in as a member of parliament. You only ever
see the works in your own constituency. That is decided by the server, not by
hiding things on screen.

### The six tiles across the top

| Tile | What it counts |
|---|---|
| **Projects** | Every work in your constituency, with how many have been approved. |
| **Need a look** | How many were flagged, and how many of those are serious. |
| **Running late** | Works with no completion date on record. |
| **Finished** | Works marked complete, and how many are still going. |
| **Money approved** | Total sanctioned, and across how many districts. |
| **Money paid out** | What percentage of the approved money has actually gone out. |

### Tab 1: Map and list

**Five ways to narrow the list.** They all work together, and they all apply to
the map and the list at the same time.

| Control | What it does |
|---|---|
| Search box | Matches the work's name, its place, or its ID. It waits until you stop typing before it searches, so it does not fire on every keystroke. |
| All districts | Only the districts that exist in your constituency are offered. |
| Any kind of work | Community halls, roads and paths, street lighting, water and drainage, and so on. |
| Any stage | Where the work has reached: recommended, sanctioned, contractor being chosen, partly done, completed. |
| Any attention level | Critical, High, Medium, Routine, or **Flagged only** which gives you everything that is not routine. |
| Clear *N* | Appears once you have set a filter. Says how many are on, and clears them all. |

Changing any filter takes you back to page 1, so you are never left looking at
page 7 of a result that now has two pages.

**The map.** Every work that matches your filters, as a coloured dot. Red is
critical, then orange, then yellow, then grey for routine. Flagged works are
drawn on top of routine ones so they are never buried. **Click a dot to open
that project.** Scroll-wheel zoom is switched off until you click the map once,
so scrolling down the page does not accidentally zoom it. The corner says
"district-level approximation", because the source files have no exact
locations.

**The list.** Twenty works to a page, with **Back** and **Next** underneath and
the page number in the middle. Each row shows:

- a badge with the attention level and the score out of 100
- the district
- the full name of the work
- a small four-part bar showing which of the four checks fired
- the approved amount
- the single biggest reason, in a few words, such as "Taking a long time"

Click any row to open the project.

### Tab 2: Needs attention

Every flagged work in your constituency, worst first, each one with its reasons
written out underneath. The number in the tab label is the number of rows in the
list, always. Click any of them to open it.

This is the tab to show a judge. It is the difference between reading 4,807 rows
and reading a short list.

### Tab 3: Charts

Six panels, all drawn from the same live data:

| Panel | What it shows |
|---|---|
| **How much needs attention** | How your works split across Critical, High, Medium and Routine. |
| **Money paid out** | What share of the approved money has been paid. |
| **Which check raised the flag** | Which of the four checks is firing most often. |
| **Stage of work** | How many works sit at each stage. |
| **Money by district** | Approved against paid for every district, with the flagged count. |
| **Kind of work** | How many works of each kind. |

Hovering over a bar gives you the exact numbers.

---

## 4. The contractor screen

A different screen, not a cut-down version of the MP one. A contractor sees only
the works in their own district.

### The four tiles

| Tile | What it counts |
|---|---|
| **Projects assigned to you** | How many works, and how many are still going. |
| **Finished** | How many are marked complete in the record. |
| **Money approved** | The total, and how much of it has been paid. |
| **Being checked** | How many of your works have been flagged for someone to look at. |

### The list

A simple numbered list, built to be usable on a phone at a work site. Search
your own works by name, and filter by stage. Each row shows the work, its ID,
its stage, the date it was sanctioned, the amount, and, if you have recorded
anything against it, how many entries you have added.

There is no map and there are no charts. A contractor does not need to survey a
constituency, they need to find their job and record what they did.

---

## 5. The project panel

Clicking any project, from either screen, opens a panel over the top. Press
**Escape** or click the **X** to close it. The page behind does not scroll while
it is open.

The top of the panel always shows the attention badge and score, the reference,
the full name, the ID, the district, the constituency, the member, and the
stage.

Then three tabs.

### Work log

The table from the brief: **Sr No, Work, Cost, Time / Date**, with a total row at
the bottom. Above it sit three numbers: the approved budget, what has been paid
according to the government files, and what the contractor has entered here.

**If you are a contractor**, there is an **Add Work** button. It opens a short
form:

| Field | Notes |
|---|---|
| Work | What you did. For example "Buy cement". |
| Cost | In rupees. Must be more than zero. |
| Date | Defaults to today. |
| Note | Optional. Supplier name, bill number, anything useful. |

Save it and it appears in the table straight away, with your name against it.
You can delete a row you added, using the X at the end of it. You cannot delete
somebody else's.

**If your entries add up to more than the approved budget**, a red warning
appears and the total turns red. The entry is still saved. Spending over budget
is exactly the kind of thing this system exists to surface, so recording it
matters more than blocking it.

**If you are an MP**, you see the same table with no Add Work button and no
delete. An MP watches, a contractor reports. That rule is enforced by the
server, not by hiding the button.

### Why flagged

The part that matters most.

- The **total score** out of 100, with the sentence explaining how the four
  checks were combined, and which one was the biggest reason.
- **Each of the four checks**, with its own score, a bar, and a sentence in
  plain words saying what it found. A check that did not fire is still shown,
  so you can see what was ruled out.
- **A second opinion from the model**, kept visibly separate, with a note saying
  it is not part of the score above and cannot explain itself.
- **Compared with similar works**: how many similar works were found, what they
  typically cost, what this one costs, and the ratio between them.
- If the duplicate check fired, **the work it looks like** is listed. Click it
  and that project opens, so you can read both side by side.

### All details

Twenty four rows, straight from the government files, nothing summarised: the
work ID, the district, the constituency, the implementing agency, the member,
the stage, all four amounts (recommended, sanctioned, disbursed, paid), how
many instalments were paid and what share of the sanction that is, five dates
(recommended, sanctioned, completed, first payment, last payment), how long it
has been on record, how long since the last payment, and the map position with
a note saying how precise it is.

This is the tab for a judge who asks "where did this number come from".

---

## 6. Things that are on every screen

| Thing | What it does |
|---|---|
| **Theme switch** | The moon or sun button in the top corner. Light and dark. Your choice is remembered on that device, and the map and the charts change with it. |
| **How it works** | A button in the top bar of the dashboard. On a narrow screen it shrinks to a **?**. It never disappears. |
| **The address bar** | Every screen has its own address. You can paste `#/how-it-works` or `#/dashboard` straight in, and the browser back button works. |
| **Keyboard** | Escape closes the project panel. Everything is reachable by tabbing. |
| **Loading** | Grey placeholder blocks while something is being fetched, so the layout does not jump around when the data lands. |
| **Empty results** | A plain sentence such as "Nothing matches these filters", never a blank box. |
| **Server not running** | A clear message saying it cannot reach the data server, not a spinning wheel forever. This is also the quickest way to prove the site is live rather than a set of pictures. |
| **Phone and tablet** | Every screen was checked at 320, 360, 390, 430, 560, 620, 768, 900, 1024 and 1280 pixels wide, in both themes. Nothing runs off the side of the screen. |

---

## 7. Who is allowed to do what

Every one of these is checked on the server. None of them depends on a button
being hidden.

| | Member of Parliament | Contractor |
|---|---|---|
| See works in their own constituency | Yes | No |
| See works in their own district | | Yes |
| See any other area | No | No |
| Map and charts | Yes | No |
| Open a project and read why it was flagged | Yes | Yes |
| Read the contractor's work log | Yes | Yes |
| Add a work log entry | **No** | Yes |
| Delete a work log entry | **No** | Only their own |
| Add an entry on a project outside their area | | **No** |

If you want to prove it rather than say it, sign in as a contractor and try the
address of a project in another district. The server returns "not found", not a
hidden button.

---

## 8. Quick answers

**"Where is the AI?"**
Two places. The four checks are rules, and they live in
`backend/scripts/prepare_data.py`. The Isolation Forest is a trained model, and
it runs in `backend/app/anomaly.py`. Its answer appears on the "Why flagged" tab
under "A second opinion from the model".

**"Is this live or is it screenshots?"**
Stop the data server and reload. The site says it cannot reach the server.

**"Can I see the raw numbers?"**
Open any project and click "All details".

**"Where does the score come from?"**
"Why flagged" shows all four parts and the total. The full formula is written
out on the How it works page under "The score".

**"How do I get back to the explainer?"**
"How it works" in the top bar, from anywhere, signed in or not.

**"What is it not doing?"**
The bottom of the front page and the last section of How it works both say so,
in plain words. Map pins are at district level, progress comes from what the
contractor enters, and it covers Maharashtra only.
