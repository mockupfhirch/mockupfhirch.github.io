// load-data.js — browser-only loader for the fhir.ch SPA.
//
// Populates the single global the bundled renderer reads:
//   window.FHIR_CH_IGS    Array of Implementation Guide entries
//
// Data source (live browser fetch, no build step, open CORS):
//   https://raw.githubusercontent.com/hl7ch/hl7ch.github.io/main/
//     package-registry.json + per-IG package-list.json

(function () {
  'use strict';

  // ───────────────────────────── Source ──────────────────────────────
  var GH_BASE = 'https://raw.githubusercontent.com/hl7ch/hl7ch.github.io/main';
  var REGISTRY_URL = GH_BASE + '/package-registry.json';

  // ──────────────────────────── Blacklist ────────────────────────────
  // Hand-curated set of package-ids to drop from the registry — applied
  // to both upstream packages and EXTRA_IGS. Add a one-line comment per
  // entry explaining WHY it is excluded, so future curators have context.
  var BLACKLIST = new Set([
    'ch.fhir.ig.ch-ig',           // empty example/template IG, not for the public registry
    'ch.fhir.ig.ch-atc',          // superseded by CH EPR FHIR — hidden per HL7 CH (Oliver, 2026-06-16)
    'ch.fhir.ig.ch-epr-ppqm',     // superseded by CH EPR FHIR — hidden per HL7 CH (Oliver, 2026-06-16)
    'ch.fhir.ig.ch-epr-mhealth',  // superseded by CH EPR FHIR — hidden per HL7 CH (Oliver, 2026-06-16)
    'ch.fhir.ig.ch-epr-term'      // superseded by CH Term — hidden per HL7 CH (2026-06-18)
  ]);

  // ─────────────────── Current ballot cycle ───────────────────
  // Single source of truth for everything the catalog needs to
  // surface a HL7.ch ballot. When non-null, drives:
  //   • the green VOTE chip on each per-IG ballot row,
  //   • the blue "Register to vote · Ballot YYYY →" hero button.
  // Set BALLOT_CYCLE = null to close the cycle — chips and button
  // both vanish, no other edits required. See QUICKSTART.md.
  var BALLOT_CYCLE = {
    year:                '2026',
    registrationFormId:  '13zN8gpFz_XjTDf3MZHo8E0SL9xjj8TJQ8AxcZQONOwY',
    forms: {
      'ch.fhir.ig.ch-alis-connect': '1Ge_9fwM_yd3ZaLBwumlQuMzlz1AaZi1RAAeMw6RlDds',
      'ch.fhir.ig.ch-core':         '1KpM4JShkLgxPdYZp302tn4P67a4SPVpzaAMavDWjoZM',
      'ch.fhir.ig.ch-emr':          '1Gdno09fFDJZJ5oKwqCmEqEHE0pHzev-ZPwvaon2qM5I',
      'ch.fhir.ig.ch-ems':          '1CerI1Fk09RYYFX8ofg7MYCpzpDtG4NhwnfaTv24GLCo',
      'ch.fhir.ig.ch-idmp':         '1IqLR7ER3hgs6-Qaplig0QHOAOY3gGLtdy9i2xAMYaCM',
      'ch.fhir.ig.ch-umzh-connect': '1ySV0k7cwbj5ybjzgFLv9sz1nHCFJBXiMat_wgJKdJ1g',
      'ch.fhir.ig.ch-vacd':         '1YoEE_hDSb3jcvv8GkPG3w-LikLWRH2z8_GV7NSKK8nQ'
    }
  };
  // var BALLOT_CYCLE = null;   // ← uncomment when the cycle closes

  var BALLOT_VOTE_FORMS = (BALLOT_CYCLE && BALLOT_CYCLE.forms) || {};
  function voteFormUrl(id) { return 'https://docs.google.com/forms/d/' + id + '/viewform'; }
  window.FHIR_CH_BALLOT_CYCLE = BALLOT_CYCLE;

  // ─── HL7 CH workgroup shorthands ────────────────────────────────────
  // Per-IG attribution restored from the legacy index.legacy.html cards.
  var TC_URL = 'https://www.hl7.ch/technisches-komitee/';
  var WG_FHIR   = { name: 'Arbeitsgruppe FHIR', url: 'https://www.hl7.ch/en/working-group-fhir' };
  var WG_AF_EPD = { name: 'Joint Venture Arbeitsgruppe Austauschformate EPD', url: TC_URL };
  var WG_RAD    = { name: 'Joint Venture Arbeitsgruppe Radiologie', url: TC_URL };
  var WG_LAB    = { name: 'Joint Venture Laborprojekt', url: TC_URL };
  var WG_EPD    = { name: 'Joint Venture Arbeitsgruppe EPD', url: TC_URL };

  // ─────────────────────────── IG overrides ──────────────────────────
  // Hand-curated per-IG metadata that upstream doesn't provide:
  //   organization     (id matching ORG_NAMES below)
  //   workgroup        ({name, url}) — HL7 CH working group responsible
  //   ballotType       ("stu" | "dstu")
  //   ballotCloses     (ISO date)
  //   description      (overrides upstream introduction — restored from
  //                    legacy index.legacy.html, the community-validated text)
  //   links            ({source, wiki, jira})
  //   publicationStatus override ("published") — forces a release tagged
  //                    'ballot' upstream to render as published
  // IGs not listed here default to organization: 'hl7ch'.
  var OVERRIDES = {
    // ─── HL7 Switzerland — Arbeitsgruppe FHIR ────────────────────────
    'ch.fhir.ig.ch-core': {
      description: 'Core FHIR profiles for Switzerland by HL7 Switzerland FHIR workgroup. See wiki for more information.',
      workgroup: WG_FHIR
    },
    'ch.fhir.ig.ch-term': {
      description: 'FHIR implementation guide containing terminology that is used in Switzerland for the core profiles, various exchange formats and also in the context of the Swiss electronic patient record (EPR).',
      workgroup: WG_FHIR
    },
    'ch.fhir.ig.cda-fhir-maps': {
      description: 'This Implementation Guide provides maps to transform documents from CDA to FHIR and back.',
      workgroup: WG_FHIR
    },

    // ─── HL7 Switzerland — Joint Venture Austauschformate EPD ────────
    'ch.fhir.ig.ch-emed': {
      description: 'FHIR eMedication exchange formats for Annex 4.',
      workgroup: WG_AF_EPD
    },
    'ch.fhir.ig.ch-vacd': {
      description: 'Implementation Guide for the exchange of vaccination and immunization information in Switzerland.',
      workgroup: WG_AF_EPD
    },
    'ch.fhir.ig.ch-allergyintolerance': {
      description: 'Swiss Implementation Guide for Allergy & Intolerance based on the recommendations of the interprofessional working group EPR (IPAG).',
      workgroup: WG_AF_EPD
    },
    'ch.fhir.ig.ch-orf': {
      description: 'The Order & Referral by Form (CH ORF) Profile describes how forms for eReferrals, requests for information (such as diagnostic imaging results, lab results, discharge reports etc.) can be defined, deployed and used in order to achieve a syntactical and semantically consistent cross enterprise information exchange.',
      workgroup: WG_AF_EPD
    },
    'ch.fhir.ig.ch-etoc': {
      description: 'Transition of Care Implementation Guide based on the IPAG report.',
      workgroup: WG_AF_EPD
    },

    // ─── HL7 Switzerland — Joint Venture Radiologie ──────────────────
    'ch.fhir.ig.ch-rad-order': {
      description: 'Based on the CH ORF Implementation Guide for Order & Referral in the Radiology domain to achieve a syntactical and semantically consistent cross enterprise information exchange.',
      workgroup: WG_RAD
    },

    // ─── HL7 Switzerland — Joint Venture Laborprojekt ────────────────
    'ch.fhir.ig.ch-lab-order': {
      description: 'Swiss Implementation Guide for the exchange of order data in the laboratory sector.',
      workgroup: WG_LAB
    },
    'ch.fhir.ig.ch-lab-report': {
      description: 'Implementation Guide for Laboratory Reports in Switzerland.',
      workgroup: WG_LAB
    },

    // ─── HL7 Switzerland — Joint Venture Arbeitsgruppe EPD ───────────
    'ch.fhir.ig.ch-ips': {
      description: 'Swiss IPS based on the International Patient Summary Implementation Guide.',
      workgroup: WG_EPD
    },
    'ch.fhir.ig.ch-epreg': {
      description: 'This Implementation Guide describes the FHIR representation of the electronic pregnancy passport in Switzerland.',
      workgroup: WG_EPD
    },

    // ─── HL7 Switzerland — eCH / IVR ─────────────────────────────────
    'ch.fhir.ig.ch-ems': {
      description: 'Implementation Guide for the Emergency Medical Service protocol (eCH-0207) from IVR and HL7 Switzerland.',
      workgroup: { name: 'IVR / HL7 Switzerland', url: 'mailto:felix.fischer@borsconsulting.ch' }
    },

    // ─── FOPH ────────────────────────────────────────────────────────
    'ch.fhir.ig.ch-elm': {
      organization: 'foph',
      description: 'CH ELM is a project of the Swiss Federal Office of Public Health (FOPH), Communicable Diseases Division, to enable laboratories to send their observations of notifiable communicable infectious diseases to the FOPH electronically.'
    },
    'ch.fhir.ig.ch-epl': {
      organization: 'foph',
      description: 'The specialties list (SL) is the official list of reimbursable medicines in Switzerland, maintained by the Federal Office of Public Health (FOPH). This FHIR Implementation Guide defines the standardized representation and exchange of SL data using HL7® FHIR®, supporting interoperability in the Swiss healthcare system. It provides FHIR profiles for medicines, prices, packaging, and reimbursement conditions, enabling consistent integration across healthcare applications and services.'
    },
    'ch.fhir.ig.ch-crl': {
      organization: 'foph',
      description: 'Implementation Guide that specifies the exchange format for cancer registration. In order to achieve data completeness on a national level, institutions involved in diagnosing or treating cancer are required to report cases of cancer to a cancer registry.'
    },

    // ─── HL7 Switzerland — STU Ballot ────────────────────────────────
    'ch.fhir.ig.ch-emr': {
      // STU Ballot under HL7.ch (was previously attributed to eHealth Suisse).
      organization: 'hl7ch'
    },

    // ─── HL7 Switzerland — joint Informative Ballots ─────────────────
    // Run as Informative Ballot under HL7.ch alongside their publisher,
    // so each renders under its own "HL7 Switzerland / X" section header.
    'ch.fhir.ig.ch-alis-connect': {
      organization: 'hl7ch-alis'
    },
    'ch.fhir.ig.ch-umzh-connect': {
      organization: 'hl7ch-umzh',
      description: 'FHIR Implementation Guide for the University Medicine Zurich (UMZH) focusing on referral processes.',
      ballotType: 'dstu',
      links: {
        source: 'https://github.com/umzhconnect/umzhconnect-ig',
        wiki: 'https://github.com/umzhconnect/umzhconnect-ig/wiki'
      }
    },
    'ch.fhir.ig.ch-idmp': {
      organization: 'hl7ch-refdata',
      description: 'IDMP base Implementation Guide published by Refdata Foundation for Swissmedic.'
    },
    'ch.fhir.ig.ch-epr-fhir': {
      organization: 'hl7ch-ehealth-suisse',
      description: 'This national extension provides a FHIR based API for the Swiss EPR by extending the IHE FHIR based mobile profiles.',
      workgroup: { name: 'eHealth Suisse', url: 'mailto:martin.smock@e-health-suisse.ch' },
      // Upstream package-list.json marks 5.0.0 as status="ballot" but this is
      // the released national extension. Treat as published.
      publicationStatus: 'published'
    },

    // ─── CARA ────────────────────────────────────────────────────────
    'ch.fhir.ig.ch-emed-epr': {
      organization: 'cara',
      description: 'FHIR eMedication exchange formats for the implementation effort of CARA within its EPR community.'
    }
    // Example with ballot info:
    // 'ch.fhir.ig.ch-core': { ballotCloses: '2026-07-15', ballotType: 'stu' }
  };

  // ──────────────────────────── Org names ────────────────────────────
  // Order matches the bundled renderer's expected sort order. Anything not
  // in this map renders under its bare id.
  var ORG_NAMES = {
    'hl7ch':                'HL7 Switzerland',
    'hl7ch-alis':           'HL7 Switzerland / ALIS Connect',
    'hl7ch-umzh':           'HL7 Switzerland / UMZH Connect',
    'hl7ch-refdata':        'HL7 Switzerland / Refdata Foundation',
    'hl7ch-ehealth-suisse': 'HL7 Switzerland / eHealth Suisse',
    'ehealth-suisse':       'eHealth Suisse',
    'foph':                 'Federal Office of Public Health',
    'ech-hl7ch':            'eCH / HL7 Switzerland',
    'sphn':                 'Swiss Personalized Health Network',
    'cara':                 'CARA',
    'swissnoso':            'Swissnoso',
    'openmedical':          'Open Medical',
    'umzh':                 'Universitätsmedizin Zürich',
    'refdata':              'Refdata Foundation'
  };
  var ORG_ORDER = Object.keys(ORG_NAMES);

  // ──────────────────────────── Defaults ─────────────────────────────
  var DEFAULT_ORG = 'hl7ch';

  // ─── Fallback signals from upstream package-registry.json ──────────
  // The registry's `ci-build` field looks like
  //   http(s)://build.fhir.org/ig/{github-org}/{repo}
  // The {github-org} segment is a reasonable proxy for who owns the IG,
  // used as a fallback when no OVERRIDES.organization is set.
  //
  // NOTE: `ahdis` is intentionally NOT mapped — it is a multi-tenant
  // publisher that builds IGs owned by various orgs (e.g. CH ELM is
  // FOPH-owned but built under ahdis/ch-elm). ahdis-built IGs MUST
  // declare their owner via OVERRIDES.organization.
  var CI_BUILD_ORG = {
    'hl7ch':         'hl7ch',
    'ehealthsuisse': 'ehealth-suisse',
    'umzhconnect':   'umzh',
    'cara-ch':       'cara',
    'bag-epl':       'foph'
  };

  // Per-org fallback workgroup. Applied only when an IG has no
  // OVERRIDES.workgroup. Orgs with multiple workgroups (HL7 CH spans
  // Arbeitsgruppe FHIR, JV EPD, JV Radiologie, JV Labor…) intentionally
  // have no default — per-IG curation is the right tool there.
  var ORG_DEFAULT_WG = {
    'ehealth-suisse': { name: 'eHealth Suisse', url: 'mailto:martin.smock@e-health-suisse.ch' },
    'swissnoso':      { name: 'Swissnoso',      url: 'mailto:contact@swissnoso.ch' },
    'openmedical':    { name: 'Open Medical',   url: 'https://www.openmedical.swiss/#contact' }
  };

  function deriveOrgFromCiBuild(ciBuild) {
    if (!ciBuild) return null;
    var m = /build\.fhir\.org\/ig\/([^\/]+)\//i.exec(ciBuild);
    if (!m) return null;
    return CI_BUILD_ORG[m[1].toLowerCase()] || null;
  }

  // ──────────────────────────── Extra IGs ────────────────────────────
  // IGs not present in the upstream HL7-CH package-registry but that should
  // still appear in the catalog. Hand-curated; add new entries here.
  var EXTRA_IGS = [{
    id: 'https://fhir.ch/igs/swissnoso',
    identifier: 'ch.fhir.ig.swissnoso',
    name: 'Swissnoso Implementation Guide',
    description: 'Implementation guide to specify the exchange format for data transmission to Swissnoso in the context of monitoring and prevention of healthcare-associated infections.',
    fhirVersion: ['4.0.1'],
    publicationStatus: 'published',
    organization: { id: 'swissnoso', name: 'Swissnoso' },
    workgroup: { name: 'Swissnoso', url: 'mailto:contact@swissnoso.ch' },
    url: 'http://fhir.ch/ig/swissnoso/',
    codeRepository: 'https://github.com/ahdis/swissnoso',
    links: {
      ig: 'http://fhir.ch/ig/swissnoso/',
      ciBuild: 'http://build.fhir.org/ig/ahdis/swissnoso/index.html',
      history: 'http://fhir.ch/ig/swissnoso/history.html',
      source: 'https://github.com/ahdis/swissnoso'
    }
  }, {
    id: 'https://fhir.ch/igs/mednet-interface',
    identifier: 'ch.fhir.ig.mednet-interface',
    name: 'MedNet Interface IG',
    description: 'This Implementation Guide describes the bundle that can be used to transfer patient information to MedNet, providing an optimized pre-filling of all forms.',
    fhirVersion: ['4.0.1'],
    publicationStatus: 'published',
    organization: { id: 'openmedical', name: 'Open Medical' },
    workgroup: { name: 'Open Medical', url: 'https://www.openmedical.swiss/#contact' },
    url: 'https://doc.mednet.swiss/fhir/index.html',
    links: {
      ig: 'https://doc.mednet.swiss/fhir/index.html',
      history: 'https://doc.mednet.swiss/fhir/history.html'
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

  // Build one fully-formed IG entry for a specific version.
  //
  //   pkg            — upstream package-registry.json entry (shared metadata)
  //   plist          — upstream per-IG package-list.json (for introduction etc.)
  //   versionEntry   — the specific version object from plist.list (or pkg.latest
  //                    as a fallback); supplies version/date/path/fhirversion/status/sequence
  //   status         — final publicationStatus to assign ('published'|'under-ballot')
  function buildOne(pkg, plist, versionEntry, status) {
    var pkgId = pkg['package-id'];
    var over = OVERRIDES[pkgId] || {};
    var orgId = over.organization
      || deriveOrgFromCiBuild(pkg['ci-build'])
      || DEFAULT_ORG;
    var description = over.description
      || (plist && plist.introduction)
      || pkg.title || '';
    var fhirVersion = versionEntry && versionEntry.fhirversion ? [versionEntry.fhirversion] : [];
    var canonical = (pkg.canonical || '').replace(/\/$/, '');
    var version = versionEntry && versionEntry.version;
    var versionPath = (versionEntry && versionEntry.path) || '';
    var versionedUrl = versionPath
      ? versionPath.replace(/\/?$/, '/')
      : (canonical && version ? canonical + '/' + version + '/' : '');
    var slug = pkgId.indexOf('ch.fhir.ig.') === 0 ? pkgId.slice('ch.fhir.ig.'.length) : pkgId;

    var overLinks = over.links || {};
    var links = { ig: versionedUrl };
    if (pkg['ci-build']) links.ciBuild = pkg['ci-build'];
    if (canonical) links.history = canonical + '/history.html';
    links.source = overLinks.source || ('https://github.com/hl7ch/' + slug);
    links.wiki = overLinks.wiki || ('https://github.com/hl7ch/' + slug + '/wiki');
    if (overLinks.jira) links.jira = overLinks.jira;

    var rawName = pkg.title || slug;
    var ig = {
      id: 'https://fhir.ch/igs/' + slug,
      identifier: pkgId,
      // Strip trailing "(R4)" / "(R5)" — FHIR version already shows on the card.
      name: rawName.replace(/\s*\(R\d+\)\s*$/i, ''),
      description: (description || '').trim(),
      version: version,
      fhirVersion: fhirVersion,
      date: (versionEntry && versionEntry.date) || '',
      publicationStatus: status,
      organization: { id: orgId, name: ORG_NAMES[orgId] || orgId },
      url: versionedUrl,
      codeRepository: links.source,
      links: links
    };
    if (over.workgroup) ig.workgroup = over.workgroup;
    else if (ORG_DEFAULT_WG[orgId]) ig.workgroup = ORG_DEFAULT_WG[orgId];
    if (status === 'under-ballot') {
      ig.ballotType = over.ballotType || deriveBallotType(versionEntry || {});
      if (over.ballotCloses) ig.ballotCloses = over.ballotCloses;
      if (BALLOT_VOTE_FORMS[pkgId]) ig.voteForm = voteFormUrl(BALLOT_VOTE_FORMS[pkgId]);
    }
    return ig;
  }

  // Emit 0, 1, or 2 entries per IG — one for the latest published
  // version, one for the latest ballot version, when those exist.
  function buildIgEntries(pkg, plist) {
    var pkgId = pkg['package-id'];
    var latest = pkg.latest || {};
    if (!latest.version || latest.version === 'current') return [];
    var over = OVERRIDES[pkgId] || {};

    // Synthesize a "versionEntry" from pkg.latest as a last-resort fallback,
    // so the loader still works when plist.list is missing or empty.
    var latestAsEntry = {
      version: latest.version,
      path: latest.path || '',
      date: latest.date || '',
      fhirversion: '',
      status: /-ballot$/.test(latest.version) ? 'ballot' : 'trial-use',
      sequence: ''
    };

    // Override short-circuit — ch-epr-fhir: upstream marks 5.0.0 as
    // status='ballot' but it's released. Treat as published.
    if (over.publicationStatus === 'published') {
      return [buildOne(pkg, plist, latestAsEntry, 'published')];
    }

    // Walk plist.list (newest first) — pick latest non-ballot and latest ballot.
    var pub = null, bal = null;
    var list = (plist && plist.list) || [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v.version || v.version === 'current' || v.status === 'ci-build') continue;
      if (v.status === 'ballot') { if (!bal) bal = v; }
      else                       { if (!pub) pub = v; }
      if (pub && bal) break;
    }

    // Upstream curation sometimes lags: package-registry.json advertises a
    // -ballot version that the per-IG package-list.json hasn't been updated
    // to include yet (CH EMS 2.0.0-ballot dated 2026-06-15 is the canonical
    // example — its plist still only lists the 2020 trial-use release).
    // Surface the registry-level ballot when the plist is missing it.
    if (!bal && /-ballot$/.test(latest.version)) {
      bal = {
        version:     latest.version,
        path:        latest.path || '',
        date:        latest.date || '',
        // Most ballots stay on the same FHIR release as the prior pub.
        fhirversion: (pub && pub.fhirversion) || '',
        status:      'ballot',
        sequence:    ''
      };
    }

    // Drop the ballot if it's already been superseded by a released
    // version — upstream often leaves stale "status: ballot" entries
    // after the next trial-use ships (e.g. CH LAB-Report's 2.0.0-ballot
    // from May 2025 with 2.0.0 trial-use released in Dec 2025).
    if (bal && pub && bal.date && pub.date && bal.date <= pub.date) {
      bal = null;
    }

    // STU/DSTU inference: when upstream doesn't set `sequence` (registry-
    // level ballot fallback, or per-IG list with the field omitted), IGs
    // whose first release was 0.x.x are almost always informative (DSTU
    // by convention). Fall back to `latest.version` when plist is empty.
    if (bal && !bal.sequence) {
      var firstV = '';
      for (var fi = list.length - 1; fi >= 0; fi--) {
        var fv = list[fi];
        if (!fv.version || fv.version === 'current' || fv.status === 'ci-build') continue;
        firstV = fv.version;
        break;
      }
      if (!firstV) firstV = latest.version;
      if (/^0\./.test(firstV)) bal.sequence = 'DSTU';
    }

    if (!pub && !bal) {
      // No usable plist — fall back to pkg.latest.
      return [buildOne(pkg, plist, latestAsEntry, derivePublicationStatus(latest.version, {}))];
    }
    var out = [];
    if (pub) out.push(buildOne(pkg, plist, pub, 'published'));
    if (bal) out.push(buildOne(pkg, plist, bal, 'under-ballot'));
    return out;
  }

  function loadIgs() {
    return fetchJson(REGISTRY_URL).then(function (registry) {
      var packages = (registry.packages || []).filter(function (pkg) {
        return !BLACKLIST.has(pkg['package-id']);
      });
      // Surface IGs upstream lists but we haven't curated yet — devtools
      // diagnostic only. Defaults still render; curator sees the gap.
      var uncurated = packages
        .filter(function (p) { return !OVERRIDES[p['package-id']]; })
        .map(function (p) { return p['package-id']; });
      if (uncurated.length) {
        console.warn('[load-data] Upstream IGs without an OVERRIDES entry — defaults applied:', uncurated);
      }
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
          var entries = buildIgEntries(packages[i], plists[i]);
          for (var k = 0; k < entries.length; k++) graph.push(entries[k]);
        }
        for (var j = 0; j < EXTRA_IGS.length; j++) {
          if (BLACKLIST.has(EXTRA_IGS[j].identifier)) continue;
          graph.push(EXTRA_IGS[j]);
        }
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
