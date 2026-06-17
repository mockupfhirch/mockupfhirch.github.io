# QUICKSTART

The fast path for maintaining the fhir.ch IG catalog. If you just need to start a ballot cycle, hide an IG, or add a workgroup attribution, you're in the right place. For the full data contracts and every curation knob, see [README.md](README.md).

## 1. The pipeline in 60 seconds

```
  hl7ch/hl7ch.github.io  ─┐
  (canonical registry)    │   fetch at page-load
                          ▼
  package-registry.json  ─┤   (CORS-open via raw.githubusercontent.com)
  ig/<slug>/package-list  ─┘
                          │
                          ▼
                 js/load-data.js    ← curated overlay
                 (OVERRIDES,          (workgroup, organization,
                  BLACKLIST,           description, ballot info,
                  EXTRA_IGS,           hidden IGs, vote forms…)
                  BALLOT_VOTE_FORMS)
                          │
                          ▼
                  js/app.js         ← renderer
                          │
                          ▼
                  index.html        ← page chrome
                                      (hero CTA, tabs, sub-tabs)
```

Two upstream JSON files (the registry and one `package-list.json` per IG) live in [`hl7ch/hl7ch.github.io`](https://github.com/hl7ch/hl7ch.github.io). The browser fetches them on every page load, applies the curated overlay in `js/load-data.js`, and the renderer in `js/app.js` paints the result into `index.html`. **No build step, no Node, no CI runtime — edit a file, reload the page.**

The per-IG `package-list.json` is the **version history**: the loader walks it newest-first and picks at most two versions per IG (latest published + latest open ballot). A ballot is silently dropped if a newer published release already exists.

## 2. Run it locally (10 seconds)

```sh
python3 -m http.server 8000
open http://localhost:8000/
```

An internet connection is required — the catalog data is fetched at load time, not bundled.

## 3. What lives where

| You want to change… | Edit this | Notes |
|---|---|---|
| IG metadata (workgroup, organization, description, ballot info) | `js/load-data.js` → `OVERRIDES` | Keyed by `package-id`. |
| Whether an IG appears at all | `js/load-data.js` → `BLACKLIST` or `EXTRA_IGS` | Drop / add. |
| Ballot vote form links | `js/load-data.js` → `BALLOT_VOTE_FORMS` | One Drive file id per IG. |
| Hero buttons, ballot sub-tab strip, page header | `index.html` | Static markup; no template engine. |
| **The actual catalog data** (a new IG, a new version, a fixed title) | **PR against [`hl7ch/hl7ch.github.io`](https://github.com/hl7ch/hl7ch.github.io)** | Don't try to fake it locally — file the PR upstream. |

## 4. Common tasks

### Open a ballot cycle

1. In Google Drive, find each `<IG short name> - HL7.ch Ballot 20XX` form plus the `Registration HL7.ch Ballots 20XX` form. Each Drive URL is `https://docs.google.com/forms/d/<FILE_ID>/edit` — copy the `<FILE_ID>` segment.
2. In `js/load-data.js`, update `BALLOT_VOTE_FORMS` (just below `BLACKLIST`). Keys are `package-id`s, values are the Drive file id only — the loader builds the public form URL itself. Update the `// 20XX cycle` comment.
3. In `index.html`, update the **Register to vote · Ballot 20XX →** button in `.hero-cta` (around line 78): `href` to the registration form, label year to match. Make sure it sits at `.btn primary` (and "Join FHIR.ch work group calls" at `.btn outline`) for the duration of the cycle.
4. Reload `http://localhost:8000/`: every open ballot row gets a green **VOTE** chip, the hero shows a blue **Register to vote · Ballot 20XX →** button.

### Close a ballot cycle

1. Empty `BALLOT_VOTE_FORMS` in `js/load-data.js` (leave one commented-out example so the next curator sees the shape).
2. In `index.html`, remove the **Register to vote · Ballot 20XX →** button from `.hero-cta`. Promote **Join FHIR.ch work group calls** back to `.btn primary`.

### Curate an IG (workgroup, organization, description, ballot dates)

Add or edit an entry in `OVERRIDES` (`js/load-data.js`), keyed by the IG's `package-id`:

```js
'ch.fhir.ig.ch-core': {
  description: '…',                 // overrides the upstream introduction
  workgroup:   WG_FHIR,             // use one of the WG_* shorthands above
  organization:'hl7ch',             // id matching ORG_NAMES
  ballotType:  'stu',               // 'stu' | 'dstu' — overrides sequence inference
  ballotCloses:'2026-07-15',        // ISO date shown on the ballot row
  links:       { source, wiki, jira },   // optional overrides
  publicationStatus: 'published'    // force-promote a ballot-tagged release
}
```

All fields are optional — set only what you want to override. IGs with no `OVERRIDES` entry get sensible defaults; check the browser devtools for a `console.warn` listing every IG currently running on defaults.

### Hide an IG

Append the `package-id` to `BLACKLIST` (`js/load-data.js`) with a one-line `// why` comment. Existing entries (CH ATC, CH EPR PPQm, CH EPR mHealth — all superseded by CH EPR FHIR) are good templates.

### Add an IG that isn't in upstream yet

Append a fully-specified record to `EXTRA_IGS` in `js/load-data.js`. The Swissnoso and MedNet Interface entries are the working templates — copy one and replace the fields. This is a stopgap; the proper fix is a PR against [`hl7ch/hl7ch.github.io`](https://github.com/hl7ch/hl7ch.github.io) so the IG ships through the real registry.

## 5. When to read the full README

Open [README.md](README.md) when you need:

- The full per-field contract for upstream `package-registry.json` and `package-list.json`.
- How the automatic fallbacks (`CI_BUILD_ORG`, `ORG_DEFAULT_WG`, sequence/DSTU inference) decide an IG's organization and ballot type when `OVERRIDES` is silent.
- The pinning / sort rules in `js/app.js` (which IGs float to the top, how org groups are ordered).
