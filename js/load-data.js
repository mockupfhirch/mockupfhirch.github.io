// load-data.js — browser-only loader for the fhir.ch SPA.
//
// Populates the single global the bundled renderer reads:
//   window.FHIR_CH_IGS    Array of Implementation Guide entries
//
// Data source (live browser fetch, no build step, open CORS):
//   https://raw.githubusercontent.com/benjamin-arfa/hl7ch.github.io/main/
//     package-registry.json + per-IG package-list.json

(function () {
  'use strict';

  // ───────────────────────────── Source ──────────────────────────────
  var GH_BASE = 'https://raw.githubusercontent.com/benjamin-arfa/hl7ch.github.io/main';
  var REGISTRY_URL = GH_BASE + '/package-registry.json';

  // ─────────────────────────── IG overrides ──────────────────────────
  // Hand-curated per-IG metadata that upstream doesn't provide:
  //   organization (id, name)
  //   ballotType   ("stu" | "informative")
  //   ballotCloses (ISO date)
  //   description  (overrides upstream introduction)
  //   links        ({source, wiki, jira})
  // Add an entry here when an IG needs to be re-attributed or its ballot
  // date / extra links published.
  // Per-IG overrides. Organization assignments taken from fhir.ch's own
  // groupings (the authoritative source). IGs not listed here default to
  // organization: 'hl7ch'.
  var OVERRIDES = {
    // ─── FOPH ────────────────────────────────────────────────────────
    'ch.fhir.ig.ch-elm': {
      organization: 'foph',
      description: 'CH ELM is a project of the Swiss Federal Office of Public Health (FOPH) for electronic laboratory reporting of notifiable diseases.'
    },
    'ch.fhir.ig.ch-epl': {
      organization: 'foph'
    },
    'ch.fhir.ig.ch-crl': {
      organization: 'foph'
    },
    // ─── eHealth Suisse ──────────────────────────────────────────────
    'ch.fhir.ig.ch-epr-fhir': {
      organization: 'ehealth-suisse',
      // Upstream package-list.json marks 5.0.0 as status="ballot" but this is
      // the released national extension. Treat as published.
      publicationStatus: 'published'
    },
    'ch.fhir.ig.ch-emr': {
      organization: 'ehealth-suisse'
    },
    // ─── HL7 Switzerland (ch-ems is the eCH-0207 protocol, but published by HL7 CH) ─
    'ch.fhir.ig.ch-ems': {
      description: 'Implementation Guide for the Emergency Medical Service protocol (eCH-0207) from IVR and HL7 Switzerland.'
    },
    // ─── CARA ────────────────────────────────────────────────────────
    'ch.fhir.ig.ch-emed-epr': {
      organization: 'cara'
    },
    // ─── Refdata Foundation (for Swissmedic) ─────────────────────────
    'ch.fhir.ig.ch-idmp': {
      organization: 'refdata',
      description: 'IDMP base Implementation Guide published by Refdata Foundation for Swissmedic.'
    }
    // Example with ballot info:
    // 'ch.fhir.ig.ch-core': { ballotCloses: '2026-07-15', ballotType: 'stu' }
  };

  // ──────────────────────────── Org names ────────────────────────────
  // Order matches the bundled renderer's expected sort order. Anything not
  // in this map renders under its bare id.
  var ORG_NAMES = {
    'hl7ch': 'HL7 Switzerland',
    'ehealth-suisse': 'eHealth Suisse',
    'foph': 'Federal Office of Public Health',
    'ech-hl7ch': 'eCH / HL7 Switzerland',
    'sphn': 'Swiss Personalized Health Network',
    'cara': 'CARA',
    'swissnoso': 'Swissnoso',
    'openmedical': 'Open Medical',
    'umzh': 'Universitätsmedizin Zürich',
    'refdata': 'Refdata Foundation'
  };
  var ORG_ORDER = Object.keys(ORG_NAMES);

  // ──────────────────────────── Defaults ─────────────────────────────
  var DEFAULT_ORG = 'hl7ch';

  // ──────────────────────────── Extra IGs ────────────────────────────
  // IGs not present in the upstream HL7-CH package-registry but that should
  // still appear in the catalog. Hand-curated; add new entries here.
  var EXTRA_IGS = [{
    id: 'https://fhir.ch/igs/ch-umzh-connect',
    identifier: 'ch.fhir.ig.ch-umzh-connect',
    name: 'CH UMZH Connect IG (R4)',
    description: 'FHIR Implementation Guide for the University Medicine Zurich (UMZH) focusing on referral processes.',
    version: '1.0.0-ballot',
    fhirVersion: ['4.0.1'],
    date: '2026-06-12',
    publicationStatus: 'under-ballot',
    ballotType: 'dstu',
    organization: { id: 'umzh', name: 'Universitätsmedizin Zürich' },
    url: 'http://fhir.ch/ig/ch-umzh-connect/1.0.0-ballot/',
    codeRepository: 'https://github.com/umzhconnect/umzhconnect-ig',
    links: {
      ig: 'http://fhir.ch/ig/ch-umzh-connect/1.0.0-ballot/',
      ciBuild: 'https://build.fhir.org/ig/umzhconnect/umzhconnect-ig/',
      history: 'http://fhir.ch/ig/ch-umzh-connect/history.html',
      source: 'https://github.com/umzhconnect/umzhconnect-ig',
      wiki: 'https://github.com/umzhconnect/umzhconnect-ig/wiki'
    }
  }];

  // ════════════════════════════ Helpers ══════════════════════════════
  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      // Some upstream files carry a UTF-8 BOM.
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      return JSON.parse(txt);
    });
  }

  // ════════════════════════════ IG build ═════════════════════════════
  function derivePublicationStatus(version, entry) {
    var status = (entry && entry.status) || '';
    if (status === 'ballot' || /-ballot$/.test(version)) return 'under-ballot';
    return 'published';
  }

  function deriveBallotType(entry) {
    // Two ballot kinds: 'stu' (Standard for Trial Use, current naming) and
    // 'dstu' (Draft STU / Informative — same lifecycle, older terminology).
    var seq = ((entry && entry.sequence) || '').toUpperCase();
    if (seq.indexOf('DSTU') === 0) return 'dstu';
    if (seq.indexOf('STU') === 0) return 'stu';
    if (entry && entry.status === 'informative') return 'dstu';
    return 'stu';
  }

  function buildIgEntry(pkg, plist) {
    var pkgId = pkg['package-id'];
    var latest = pkg.latest || {};
    var version = latest.version;
    if (!version || version === 'current') return null;

    var entry = null;
    if (plist && plist.list) {
      for (var i = 0; i < plist.list.length; i++) {
        if (plist.list[i].version === version) { entry = plist.list[i]; break; }
      }
    }

    var over = OVERRIDES[pkgId] || {};
    var status = over.publicationStatus || derivePublicationStatus(version, entry || {});
    var orgId = over.organization || DEFAULT_ORG;
    var description = over.description
      || (plist && plist.introduction)
      || pkg.title || '';
    var fhirVersion = (entry && entry.fhirversion) ? [entry.fhirversion] : [];
    var canonical = (pkg.canonical || '').replace(/\/$/, '');
    var versionedUrl = canonical ? canonical + '/' + version + '/' : (latest.path || '');
    var slug = pkgId.indexOf('ch.fhir.ig.') === 0 ? pkgId.slice('ch.fhir.ig.'.length) : pkgId;

    var overLinks = over.links || {};
    var links = { ig: versionedUrl };
    if (pkg['ci-build']) links.ciBuild = pkg['ci-build'];
    if (canonical) links.history = canonical + '/history.html';
    links.source = overLinks.source || ('https://github.com/hl7ch/' + slug);
    links.wiki = overLinks.wiki || ('https://github.com/hl7ch/' + slug + '/wiki');
    if (overLinks.jira) links.jira = overLinks.jira;

    var ig = {
      id: 'https://fhir.ch/igs/' + slug,
      identifier: pkgId,
      name: pkg.title || slug,
      description: (description || '').trim(),
      version: version,
      fhirVersion: fhirVersion,
      date: latest.date || '',
      publicationStatus: status,
      organization: { id: orgId, name: ORG_NAMES[orgId] || orgId },
      url: versionedUrl,
      codeRepository: links.source,
      links: links
    };
    if (status === 'under-ballot') {
      ig.ballotType = over.ballotType || deriveBallotType(entry || {});
      if (over.ballotCloses) ig.ballotCloses = over.ballotCloses;
    }
    return ig;
  }

  function loadIgs() {
    return fetchJson(REGISTRY_URL).then(function (registry) {
      var packages = registry.packages || [];
      // Fetch every per-IG package-list.json in parallel.
      var listPromises = packages.map(function (pkg) {
        var path = pkg.path || ('ig/' + pkg['package-id'].split('.').pop() + '/package-list.json');
        return fetchJson(GH_BASE + '/' + path).catch(function (e) {
          console.warn('[load-data]', pkg['package-id'], 'no per-IG list:', e.message);
          return null;
        });
      });
      return Promise.all(listPromises).then(function (plists) {
        var graph = [];
        for (var i = 0; i < packages.length; i++) {
          var entry = buildIgEntry(packages[i], plists[i]);
          if (entry) graph.push(entry);
        }
        for (var j = 0; j < EXTRA_IGS.length; j++) graph.push(EXTRA_IGS[j]);
        graph.sort(function (a, b) {
          var ai = ORG_ORDER.indexOf(a.organization.id);
          var bi = ORG_ORDER.indexOf(b.organization.id);
          if (ai === -1) ai = ORG_ORDER.length;
          if (bi === -1) bi = ORG_ORDER.length;
          if (ai !== bi) return ai - bi;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        return graph;
      });
    });
  }

  // ════════════════════════════ Wire-up ══════════════════════════════
  loadIgs().then(function (igs) {
    window.FHIR_CH_IGS = igs;
    console.info('[load-data] IGs:', igs.length);
  }).catch(function (err) {
    console.error('[load-data] IGs failed:', err);
    window.FHIR_CH_IGS = []; // unblock the renderer
  });
})();
