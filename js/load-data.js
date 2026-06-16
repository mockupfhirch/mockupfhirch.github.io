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

  // ──────────────────────────── Blacklist ────────────────────────────
  // Hand-curated set of package-ids to drop from the registry — applied
  // to both upstream packages and EXTRA_IGS. Add a one-line comment per
  // entry explaining WHY it is excluded, so future curators have context.
  var BLACKLIST = new Set([
    'ch.fhir.ig.ch-ig'   // empty example/template IG, not for the public registry
  ]);

  // ─── HL7 CH workgroup shorthands ────────────────────────────────────
  // Per-IG attribution restored from the legacy index.legacy.html cards.
  var TC_URL = 'https://www.hl7.ch/technisches-komitee/';
  var WG_FHIR   = { name: 'Arbeitsgruppe FHIR', url: 'https://www.hl7.ch/en/working-group-fhir' };
  var WG_AF_EPD = { name: 'Joint Venture Arbeitsgruppe Austauschformate EPD', url: TC_URL };
  var WG_RAD    = { name: 'Joint Venture Arbeitsgruppe Radiologie', url: TC_URL };
  var WG_LAB    = { name: 'Joint Venture Laborprojekt', url: TC_URL };
  var WG_EPD    = { name: 'Joint Venture Arbeitsgruppe EPD', url: TC_URL };

  // ─── Superseded marker (CH ATC / PPQm / mHealth → CH EPR FHIR) ──────
  var SUPERSEDED_BY_EPR_FHIR = {
    id: 'ch.fhir.ig.ch-epr-fhir',
    name: 'CH EPR FHIR',
    url: 'http://fhir.ch/ig/ch-epr-fhir/'
  };

  // ─────────────────────────── IG overrides ──────────────────────────
  // Hand-curated per-IG metadata that upstream doesn't provide:
  //   organization     (id matching ORG_NAMES below)
  //   workgroup        ({name, url}) — HL7 CH working group responsible
  //   ballotType       ("stu" | "dstu")
  //   ballotCloses     (ISO date)
  //   description      (overrides upstream introduction — restored from
  //                    legacy index.legacy.html, the community-validated text)
  //   links            ({source, wiki, jira})
  //   publicationStatus override ("published" | "superseded")
  //   supersededBy     ({id, name, url}) — only set when publicationStatus
  //                    is "superseded"
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

    // ─── eHealth Suisse ──────────────────────────────────────────────
    'ch.fhir.ig.ch-epr-fhir': {
      organization: 'ehealth-suisse',
      description: 'This national extension provides a FHIR based API for the Swiss EPR by extending the IHE FHIR based mobile profiles.',
      workgroup: { name: 'eHealth Suisse', url: 'mailto:martin.smock@e-health-suisse.ch' },
      // Upstream package-list.json marks 5.0.0 as status="ballot" but this is
      // the released national extension. Treat as published.
      publicationStatus: 'published'
    },
    'ch.fhir.ig.ch-emr': {
      organization: 'ehealth-suisse'
    },

    // ─── Superseded by CH EPR FHIR ───────────────────────────────────
    'ch.fhir.ig.ch-atc': {
      publicationStatus: 'superseded',
      supersededBy: SUPERSEDED_BY_EPR_FHIR
    },
    'ch.fhir.ig.ch-epr-ppqm': {
      publicationStatus: 'superseded',
      supersededBy: SUPERSEDED_BY_EPR_FHIR
    },
    'ch.fhir.ig.ch-epr-mhealth': {
      publicationStatus: 'superseded',
      supersededBy: SUPERSEDED_BY_EPR_FHIR
    },

    // ─── CARA ────────────────────────────────────────────────────────
    'ch.fhir.ig.ch-emed-epr': {
      organization: 'cara',
      description: 'FHIR eMedication exchange formats for the implementation effort of CARA within its EPR community.'
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
    name: 'CH UMZH Connect',
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
  }, {
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

    var rawName = pkg.title || slug;
    var ig = {
      id: 'https://fhir.ch/igs/' + slug,
      identifier: pkgId,
      // Strip trailing "(R4)" / "(R5)" — FHIR version already shows on the card.
      name: rawName.replace(/\s*\(R\d+\)\s*$/i, ''),
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
    if (over.workgroup) ig.workgroup = over.workgroup;
    if (status === 'superseded' && over.supersededBy) ig.supersededBy = over.supersededBy;
    if (status === 'under-ballot') {
      ig.ballotType = over.ballotType || deriveBallotType(entry || {});
      if (over.ballotCloses) ig.ballotCloses = over.ballotCloses;
    }
    return ig;
  }

  function loadIgs() {
    return fetchJson(REGISTRY_URL).then(function (registry) {
      var packages = (registry.packages || []).filter(function (pkg) {
        return !BLACKLIST.has(pkg['package-id']);
      });
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
