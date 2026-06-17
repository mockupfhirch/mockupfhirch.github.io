# mockupfhirch.github.io

A static mock-up of the [fhir.ch](https://www.fhir.ch) Swiss FHIR Implementation Guide registry.

> **New to the site?** Start with [QUICKSTART.md](QUICKSTART.md) — the five most common maintenance recipes in one page. This README is the deeper reference.

The page is a single-page app — three files (`index.html`, `js/load-data.js`, `js/app.js`) plus a stylesheet. The IG catalog is **fetched at page-load time** from the canonical HL7 CH GitHub Pages repository; there is no build step, no Node, no Python, no CI runtime, no database. Any static host (GitHub Pages, Netlify, S3, `python3 -m http.server`) works.

## Run it locally

```sh
python3 -m http.server 8000
open http://localhost:8000/
```

The page fetches its data over the network at load time, so an internet connection is required.

## Where the data comes from

Two upstream files, served by the canonical HL7 CH registry repository:

| File | URL |
|---|---|
| Registry | `https://raw.githubusercontent.com/hl7ch/hl7ch.github.io/main/package-registry.json` |
| Per-IG list | `https://raw.githubusercontent.com/hl7ch/hl7ch.github.io/main/ig/{slug}/package-list.json` |

`raw.githubusercontent.com` is CORS-open, so the browser can hit it directly with no proxy. (The same files are mirrored at `https://fhir.ch/...` but that domain is reserved for the production site and may sit behind cache layers.)

For the catalog to render correctly, both files must conform to the contracts below.

## Contract — `package-registry.json`

Top-level shape:

```json
{ "packages": [ /* one entry per IG */ ] }
```

Per-entry fields read by the loader:

| Field | Required | Notes |
|---|---|---|
| `package-id` | yes | e.g. `ch.fhir.ig.ch-core`. Primary identity key. |
| `title` | yes | Used as the display name (any trailing ` (R4)` / ` (R5)` is stripped). |
| `canonical` | yes | e.g. `http://fhir.ch/ig/ch-core`. Drives the `history.html` link. |
| `latest.version` | yes | Entries where `latest.version === "current"` are skipped. |
| `latest.date` | yes | ISO date. |
| `latest.path` | yes | Absolute URL to the latest published page. |
| `path` | no | Path to the per-IG `package-list.json` relative to the registry root. Defaults to `ig/{last-segment-of-package-id}/package-list.json`. |
| `ci-build` | no | If present, becomes the `CI BUILD` chip on the card. |

## Contract — per-IG `package-list.json`

Standard FHIR `package-list.json` shape. Fields read by the loader:

| Field | Used for |
|---|---|
| `package-id`, `title`, `canonical` | sanity-checked; canonical drives the history link. |
| `introduction` | description fallback when no `OVERRIDES` description is set. |
| `list[]` | the version history. The loader walks newest-first and picks the latest non-ballot release **and** the latest ballot release (up to two cards per IG). |
| `list[].version` | display version. Entries with `version === "current"` or `status === "ci-build"` are skipped. |
| `list[].path` | the IG link target for that version. |
| `list[].date` | sort key. A ballot is dropped if a later non-ballot release exists (`bal.date <= pub.date`). |
| `list[].fhirversion` | drives the R4 / R5 filter pills. |
| `list[].status` | `current` \| `ballot` \| `trial-use` \| `informative` \| `ci-build`. |
| `list[].sequence` | starts with `STU…` or `DSTU…` — drives the STU/DSTU ballot sub-tab classification. |

Two-version cap and the "drop stale ballot" rule live in `js/load-data.js:329`–`365`. There is also a registry-level ballot fallback: if `package-registry.json` advertises a `-ballot` version that the per-IG `list` hasn't been updated to include yet, the loader synthesizes a ballot entry from the registry's `latest` (`js/load-data.js:346`–`355`). CH EMS 2.0.0-ballot is the canonical case.

## Curation knobs in `js/load-data.js`

The loader is the single source of curated overlay on top of the upstream JSON:

- **`BLACKLIST`** (`js/load-data.js:21`) — set of `package-id`s dropped before rendering, with a one-line reason comment per entry. Applies to both upstream packages and `EXTRA_IGS`.
- **`OVERRIDES`** (`js/load-data.js:49`) — per-IG curated metadata keyed by `package-id`. Recognized fields:
  - `organization` — id matching `ORG_NAMES`.
  - `workgroup` — `{name, url}`; one of the `WG_*` shorthands.
  - `ballotType` — `"stu"` \| `"dstu"`. Overrides the sequence-based default.
  - `ballotCloses` — ISO date displayed on the ballot row.
  - `description` — long-form description, overrides the per-IG `introduction`.
  - `links` — `{source, wiki, jira}`; override the default `github.com/hl7ch/{slug}` derivation.
  - `publicationStatus: 'published'` — force-promote an upstream entry tagged `ballot` to published (currently used only by `ch-epr-fhir`).
- **`EXTRA_IGS`** — array of fully-specified IG entries appended to the catalog. Use this only for IGs upstream does not yet list (currently Swissnoso and MedNet Interface). Copy an existing entry as the template — every field shown there is required.
- **`BALLOT_VOTE_FORMS`** — per-IG Google Form Drive ids for the current ballot cycle. Drives the green **VOTE** chip rendered on each open ballot row. Entries for IGs whose status isn't `under-ballot` are silently ignored. See [Updating the ballot vote forms](#updating-the-ballot-vote-forms) for the per-cycle procedure.
- **`ORG_NAMES`** and **`ORG_ORDER`** — display name per organization `id`. The `id` keys are what `OVERRIDES.organization` references. IGs with no `organization` override and no fallback signal default to `'hl7ch'`.
- **`WG_*` shorthands** — reusable workgroup objects. Add new ones rather than inlining `{name, url}` literals.

### Automatic fallbacks (no curation needed)

When an upstream IG has no `OVERRIDES` entry, two lookup tables in `js/load-data.js` derive sensible defaults from upstream signals:

- **`CI_BUILD_ORG`** — maps the GitHub-org segment of `pkg['ci-build']` (`build.fhir.org/ig/{github-org}/...`) to a catalog org `id`. Covers `hl7ch`, `ehealthsuisse`, `umzhconnect`, `cara-ch`, `bag-epl`. `ahdis` is intentionally unmapped because it is a multi-tenant publisher (CH ELM is FOPH-owned but built under `ahdis/ch-elm`); IGs built under `ahdis` must declare their owner via `OVERRIDES.organization`.
- **`ORG_DEFAULT_WG`** — per-org default workgroup, applied only when `OVERRIDES.workgroup` is absent. Covers eHealth Suisse, Swissnoso, Open Medical. HL7 CH deliberately has no default since its IGs span multiple workgroups (Arbeitsgruppe FHIR, JV EPD, JV Radiologie, JV Labor).

There is also a startup `console.warn` (in `loadIgs`) that lists every upstream IG without an `OVERRIDES` entry — devtools-only diagnostic so curators see at a glance which IGs are running on defaults.

The ballot-type derivation (`deriveBallotType` plus the inference in `buildIgEntries`) reads `sequence` from `package-list.json` and, when that is empty, falls back to: `status: 'informative'` → DSTU; first released version starts with `0.` → DSTU; otherwise STU.

Rendering pins (in `js/app.js`):

- **`PINNED_IDS`** (`js/app.js:25`) — IGs that float to the top of their org group (currently CH Term, CH Core).
- **HL7 Switzerland pin** (`js/app.js:170`) — the `hl7ch` org always renders first; other orgs sort by their newest IG date.

## Adding or hiding an IG

**Upstream-published IG.** File a PR against [`hl7ch/hl7ch.github.io`](https://github.com/hl7ch/hl7ch.github.io) that adds the package to `package-registry.json` and ships its `ig/{slug}/package-list.json`. The mock-up will pick it up on the next page load. If it needs workgroup, organization, description, or ballot-type curation, add an `OVERRIDES` entry in `js/load-data.js`.

**IG not in upstream.** Append a full record to `EXTRA_IGS` in `js/load-data.js` — Swissnoso and MedNet Interface are working templates.

**Hide an IG.** Add its `package-id` to `BLACKLIST` in `js/load-data.js`, with a short comment explaining why (the existing entries for CH ATC / CH EPR PPQm / CH EPR mHealth are good examples).

## Updating the ballot vote forms

Each ballot cycle, HL7.ch publishes one Google Form per IG under ballot, plus one registry-wide registration form. Two places in this repo reference those forms and must be updated together at the start of each cycle. The end result is:

- A green **VOTE** chip on every open ballot's row, linking to that IG's Google Form.
- A blue **Register to vote · Ballot 20XX →** button in the page hero, linking to the registry-wide registration form.

### Step 1 — Find the form Drive file ids

The forms live in HL7.ch's Google Drive. With Drive access:

1. Open Drive, search for `HL7.ch Ballot <year>` and filter the results to **Forms**. You should see one form per IG plus a `Registration HL7.ch Ballots <year>`.
2. Open each form. The URL looks like `https://docs.google.com/forms/d/<FILE_ID>/edit`. Copy the `<FILE_ID>` segment (the long string between `/d/` and `/edit`).
3. Note which IG each form is for — the form title carries the short name (e.g. *CH Core - HL7.ch Ballot 2026*), and you need to match that to the IG's `package-id` (e.g. `ch.fhir.ig.ch-core`). The mapping is by shortname → `ch.fhir.ig.<lowercased-shortname>`.

### Step 2 — Update `BALLOT_VOTE_FORMS` in `js/load-data.js`

Open `js/load-data.js` and find the `BALLOT_VOTE_FORMS` map near the top of the file (just below `BLACKLIST`). It looks like:

```js
var BALLOT_VOTE_FORMS = {
  // 2026 cycle
  'ch.fhir.ig.ch-core':  '1KpM4JShkLgxPdYZp302tn4P67a4SPVpzaAMavDWjoZM',
  'ch.fhir.ig.ch-emr':   '1Gdno09fFDJZJ5oKwqCmEqEHE0pHzev-ZPwvaon2qM5I',
  // …one entry per active per-IG form
};
```

Replace the entries with the package-ids and Drive file ids you collected in Step 1. Update the `// 20XX cycle` comment to the new year. The loader builds the public form URL itself (the `voteFormUrl` helper just below the map) — you only need the file id, not the whole URL.

Entries for IGs whose ballot is not currently open (`status` isn't `under-ballot`) are silently ignored, so leaving a stale entry is harmless but messy. Prefer to delete entries from prior cycles.

### Step 3 — Update the hero registration URL

The registry-wide registration form has the same Drive id format, but it's pasted directly into HTML rather than the JS map. Update the **Register to vote · Ballot 20XX →** button in `.hero-cta` (around line 78 of `index.html`) — both the `href` and the "Ballot 20XX" label so the year stays current.

The URL follows the shape `https://docs.google.com/forms/d/<REGISTRATION_FILE_ID>/viewform`.

### Step 4 — Test locally

From the project root, in a terminal:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. Verify:

- The hero shows a blue **Register to vote · Ballot 20XX →** button. Clicking it opens the registration form in a new tab.
- Switch to the **Under Ballot** tab. Every IG row carrying the expected open ballot now shows a green **VOTE** chip next to the red **BALLOT IG** chip; clicking it opens the matching per-IG form.
- An IG whose ballot has closed shows the BALLOT IG chip (if the ballot row is still in the data) but **no** VOTE chip.

### End-of-cycle cleanup

When the ballot cycle closes:

1. Empty `BALLOT_VOTE_FORMS` in `js/load-data.js` (or leave a single commented-out example so the structure stays visible for the next curator).
2. In `index.html`, remove the **Register to vote · Ballot 20XX →** button from `.hero-cta`. Promote the **Join FHIR.ch work group calls** button back to `.btn primary` (it sits at `.btn outline` during ballot cycles so the registration button can take the primary slot).

That returns the catalog to its quiet-state design until the next cycle begins.

Form↔IG matching is by `package-id`, not by form title. If you add a new IG mid-cycle, both `OVERRIDES` and `BALLOT_VOTE_FORMS` need an entry.

## What is NOT in the upstream contract

The upstream JSON carries no workgroup attribution, no organization grouping, no explicit ballot subtype, and no superseded-by relationships. Those are editorial decisions; the **primary** source of truth is `OVERRIDES` (and `BLACKLIST` for hiding IGs).

For uncurated IGs the loader applies the automatic fallbacks described above (`CI_BUILD_ORG`, `ORG_DEFAULT_WG`, sequence/version-based DSTU inference) so the catalog still renders sensibly when upstream adds a new IG ahead of curation. Treat the fallbacks as a safety net, not a substitute — they cannot infer superseded-by relationships, cannot distinguish multiple workgroups within HL7 CH, and cannot identify the owner of an IG built under a multi-tenant publisher like `ahdis`. Keep `OVERRIDES` in sync with HL7 CH governance.
