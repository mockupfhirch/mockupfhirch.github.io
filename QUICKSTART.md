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
                  BLACKLIST,           description, hidden IGs,
                  EXTRA_IGS,           extra IGs, ballot cycle)
                  BALLOT_CYCLE)
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
| Ballot vote forms + hero "Register to vote" button | `js/load-data.js` → `BALLOT_CYCLE` | One object for the whole cycle; set to `null` to close. |
| Hero buttons, ballot sub-tab strip, page header | `index.html` | Static markup; no template engine. |
| **The actual catalog data** (a new IG, a new version, a fixed title) | **PR against [`hl7ch/hl7ch.github.io`](https://github.com/hl7ch/hl7ch.github.io)** | Don't try to fake it locally — file the PR upstream. |

## 4. Common tasks

### Open a ballot cycle

1. In Google Drive, find each `<IG short name> - HL7.ch Ballot 20XX` form plus the `Registration HL7.ch Ballots 20XX` form. Each Drive URL is `https://docs.google.com/forms/d/<FILE_ID>/edit` — copy the `<FILE_ID>` segment.
2. In `js/load-data.js`, fill in the `BALLOT_CYCLE` object (just below `BLACKLIST`):

   ```js
   var BALLOT_CYCLE = {
     year:                '20XX',
     registrationFormId:  '<REGISTRATION_FILE_ID>',
     forms: {
       'ch.fhir.ig.ch-core':  '<CORE_FILE_ID>',
       'ch.fhir.ig.ch-emr':   '<EMR_FILE_ID>',
       // …one entry per per-IG form
     }
   };
   ```

   Reload `http://localhost:8000/`: every open ballot row gets a green **VOTE** chip, the hero shows a blue **Register to vote · Ballot 20XX →** button. No HTML edit required — `js/app.js` reads `BALLOT_CYCLE` on load and toggles the hero buttons.

### Close a ballot cycle

Set `BALLOT_CYCLE = null` in `js/load-data.js`. That's it — the hero Register button hides, "Join FHIR.ch work group calls" goes back to primary, and every per-IG VOTE chip disappears. No other edits needed.

> **Dev-mode sanity check.** When you're running on `localhost` / `127.0.0.1` / `file://`, the page prints `[ballot-cycle]` warnings to the browser console for any drift between `BALLOT_CYCLE` and the catalog data: `BALLOT_CYCLE` is `null` while IGs are still under-ballot, an under-ballot IG has no form entry, a `BALLOT_CYCLE.forms` key is stale / a typo / references a now-published IG, or `BALLOT_CYCLE.year` doesn't match any IG's `ballotCloses` year. Open devtools after any edit and you'll see what to fix. Production hostnames stay silent.

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
