# Smart Nigrani System: frontend

React + TypeScript, built with Vite. Leaflet for maps; no other runtime dependency.

Running it is in the [top-level README](../README.md). `npm run dev` for development, `npm run build` for a production build in `dist/`, `npm run lint` for the linter. Set `VITE_API_BASE` at build time if the API is not at `http://127.0.0.1:8000`.

## Where things are

```
src/
  App.tsx            shell, header, routing by address and by role
  router.ts          hash routes; filters, tabs and the selected work live in the address
  api.ts             every call to the backend
  auth.tsx           who is signed in
  theme.tsx          light and dark theme (remembered)
  presentation.ts    the analyst's presentation mode (aliases on screen only)
  hooks.ts           data loading, drafts kept through errors and refreshes, polling
  format.ts          rupees in lakh and crore, dates, labels
  styles.css         every colour and spacing value, for both themes
  pages/
    Landing.tsx            front page: network or map, filter rail, real findings
    Works.tsx              public register
    WorkPage.tsx           one work, tabbed, for every role
    HowItWorks.tsx         the explainer and method-notes search
    Login.tsx              sign-in with sample accounts for five roles
    MpDashboard.tsx        member: map and list, needs attention, updates, charts, team
    VendorDashboard.tsx    contractor and field officer
    AgencyDashboard.tsx    agency: works, register, submissions, team
    ResearchWorkspace.tsx  analyst: overview, works, network, reviews, data, methods
  components/
    work/          the work page's tabs, and the case-file export
    NetworkScene   projected 3D member-to-work network (SVG)
    MapPanel, HeroMap, Charts, Signal, Flow, SectionNav, Splash, Brand, TeamList, UpdatesFeed
public/
  favicon.svg, logo.svg, icons/, manifest.webmanifest
  images/        one credited photograph (see images/CREDITS.txt)
```
