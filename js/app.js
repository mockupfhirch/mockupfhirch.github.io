// app.js — vanilla-JS renderer for the fhir.ch IG registry.
//
// Replaces the DCLogic framework. Reads window.FHIR_CH_IGS (populated by
// js/load-data.js), holds UI state, renders the registry section into
// the static HTML mount points.

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────
  const state = {
    view: 'all',           // 'all' | 'published' | 'ballot'
    ballotKind: 'all',     // 'all' | 'stu' | 'dstu'
    search: '',
    fhirFilter: ''         // '' | '4.0.1' | '5.0.0'
  };

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  // ─── Helpers ────────────────────────────────────────────────────
  // IGs pinned to the top of their org group (in this order).
  const PINNED_IDS = ['ch.fhir.ig.ch-term', 'ch.fhir.ig.ch-core'];
  function pinIndex(ig) {
    const i = PINNED_IDS.indexOf(ig.identifier);
    return i === -1 ? Infinity : i;
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Aggregation ────────────────────────────────────────────────
  // Each upstream IG now produces up to two per-version entries
  // (one published, one under-ballot). The renderer groups them back
  // into a single card per identifier with sub-rows per version.
  function aggregate(entries) {
    const byId = new Map();
    for (const ig of entries) {
      let agg = byId.get(ig.identifier);
      if (!agg) {
        agg = {
          identifier:   ig.identifier,
          name:         ig.name,
          description:  ig.description,
          organization: ig.organization,
          workgroup:    ig.workgroup,
          links:        ig.links,     // shared per-repo links
          versions:     []
        };
        byId.set(ig.identifier, agg);
      }
      agg.versions.push({
        publicationStatus: ig.publicationStatus,
        version:           ig.version,
        date:              ig.date,
        fhirVersion:       ig.fhirVersion,
        ballotType:        ig.ballotType,
        ballotCloses:      ig.ballotCloses,
        voteForm:          ig.voteForm,
        igUrl:             (ig.links && ig.links.ig) || ig.url
      });
    }
    // Latest sits on top: ballot row first, then released.
    const subOrder = { 'under-ballot': 0, published: 1 };
    for (const agg of byId.values()) {
      agg.versions.sort((a, b) =>
        (subOrder[a.publicationStatus] ?? 9) - (subOrder[b.publicationStatus] ?? 9));
      agg.maxDate   = agg.versions.reduce((m, v) => (v.date > m ? v.date : m), '');
      agg.hasBallot = agg.versions.some(v => v.publicationStatus === 'under-ballot');
    }
    return [...byId.values()];
  }

  // Which version sub-rows should render under the active tab?
  function visibleVersions(agg, view, ballotKind) {
    if (view === 'all') return agg.versions;
    if (view === 'published') {
      return agg.versions.filter(v => v.publicationStatus !== 'under-ballot');
    }
    if (view === 'ballot') {
      return agg.versions.filter(v =>
        v.publicationStatus === 'under-ballot' &&
        (ballotKind === 'all' || v.ballotType === ballotKind));
    }
    return [];
  }

  // Sort tier inside an org group.
  //   0 = pinned (CH Term, CH Core)
  //   1 = IGs with an active ballot
  //   2 = the rest
  function tier(agg) {
    if (PINNED_IDS.includes(agg.identifier)) return 0;
    if (agg.hasBallot) return 1;
    return 2;
  }

  // ─── Compute pipeline ───────────────────────────────────────────
  function compute() {
    const all = window.FHIR_CH_IGS || [];

    // Hero stats are per-entry (per version).
    const published = all.filter(g => g.publicationStatus === 'published');
    const ballot    = all.filter(g => g.publicationStatus === 'under-ballot');
    const stu       = ballot.filter(g => g.ballotType === 'stu');
    const dstu      = ballot.filter(g => g.ballotType === 'dstu');

    const isBallotView = state.view === 'ballot';
    const isAllView    = state.view === 'all';

    // Aggregate per-identifier on the FULL entry list so each card knows
    // about both versions even when only one will render under the tab.
    let aggs = aggregate(all);

    // Drop aggregates with no version visible under the active tab.
    aggs = aggs.filter(agg =>
      visibleVersions(agg, state.view, state.ballotKind).length > 0);

    // Search filter — match against shared fields (name/id/description).
    const q = state.search.trim().toLowerCase();
    if (q) {
      aggs = aggs.filter(agg =>
        (agg.name||'').toLowerCase().includes(q) ||
        (agg.identifier||'').toLowerCase().includes(q) ||
        (agg.description||'').toLowerCase().includes(q)
      );
    }

    // FHIR version filter — keep aggregates with at least one version
    // matching the picked FHIR release.
    if (state.fhirFilter) {
      aggs = aggs.filter(agg =>
        agg.versions.some(v => (v.fhirVersion||[]).includes(state.fhirFilter))
      );
    }

    // Group by organization.
    const byOrg = new Map();
    for (const agg of aggs) {
      const k = agg.organization.id;
      if (!byOrg.has(k)) byOrg.set(k, { name: agg.organization.name, id: k, items: [] });
      byOrg.get(k).items.push(agg);
    }

    const groups = [...byOrg.values()]
      .map(g => {
        // Each org's rank is the date of its newest IG (across all
        // aggregates / all versions). HL7 Switzerland is pinned first;
        // the rest sort by most recent publisher.
        g.maxDate = g.items.reduce(
          (m, agg) => (agg.maxDate > m ? agg.maxDate : m), '');
        return g;
      })
      .sort((a, b) => {
        if (a.id === 'hl7ch') return -1;
        if (b.id === 'hl7ch') return 1;
        return (b.maxDate || '').localeCompare(a.maxDate || '');
      })
      .map(g => {
        g.items.sort((a, b) => {
          const ta = tier(a), tb = tier(b);
          if (ta !== tb) return ta - tb;
          if (ta === 0) return pinIndex(a) - pinIndex(b);
          return (b.maxDate || '').localeCompare(a.maxDate || '');
        });
        return {
          ...g,
          count: g.items.length,
          plural: g.items.length === 1 ? '' : 's'
        };
      });

    return {
      all, published, ballot, stu, dstu,
      groups,
      isBallotView,
      isAllView,
      isEmpty: groups.length === 0
    };
  }

  // ─── Chip + badge factories ─────────────────────────────────────
  function badgeForVersion(v) {
    if (v.publicationStatus === 'published') return { cls: 'badge published', text: 'PUBLISHED' };
    if (v.ballotType === 'stu')              return { cls: 'badge stu',       text: 'STU BALLOT' };
    return                                          { cls: 'badge dstu',      text: 'DSTU BALLOT' };
  }

  function versionChip(v) {
    const isBallot = v.publicationStatus === 'under-ballot';
    return {
      cls:   isBallot ? 'chip danger' : 'chip primary',
      icon:  '▤',
      label: isBallot ? 'BALLOT IG' : 'IG',
      url:   v.igUrl
    };
  }

  function sharedChips(links) {
    const chips = [];
    const L = links || {};
    if (L.ciBuild) chips.push({ cls: 'chip secondary', icon: '⟳',  label: 'CI BUILD', url: L.ciBuild });
    if (L.history) chips.push({ cls: 'chip secondary', icon: '↺',  label: 'HISTORY',  url: L.history });
    if (L.source)  chips.push({ cls: 'chip secondary', icon: '◉',  label: 'GITHUB',   url: L.source });
    if (L.wiki)    chips.push({ cls: 'chip ghost',     icon: '📓', label: 'WIKI',     url: L.wiki });
    if (L.jira)    chips.push({ cls: 'chip ghost',     icon: '✎',  label: 'JIRA',     url: L.jira });
    return chips;
  }

  // ─── Template renderers ─────────────────────────────────────────
  function renderChip(chip) {
    return `<a class="${chip.cls}" href="${escapeHtml(chip.url)}" target="_blank" rel="noopener">`
      + `<span class="icon">${chip.icon}</span><span>${escapeHtml(chip.label)}</span></a>`;
  }

  function renderVersionRow(v) {
    const badge = badgeForVersion(v);
    const chips = [renderChip(versionChip(v))];
    if (v.voteForm) {
      chips.push(renderChip({
        cls:   'chip primary',
        icon:  '✓',
        label: 'VOTE',
        url:   v.voteForm
      }));
    }
    const fhirStr = (v.fhirVersion || []).join(', ') || '—';
    const cls = (v.publicationStatus || '').replace(/[^a-z-]/g, '');
    return `<div class="version-row ${cls}">
      <span class="${badge.cls}">${badge.text}</span>
      <span class="vno">v${escapeHtml(v.version || '—')}</span>
      <span class="fhir">${escapeHtml(fhirStr)}</span>
      <span class="date">${fmtDate(v.date)}</span>
      <span class="version-chip">${chips.join('')}</span>
    </div>`;
  }

  function renderIgCard(agg, view, ballotKind) {
    const versions = visibleVersions(agg, view, ballotKind);
    if (!versions.length) return '';

    const workgroupMeta = agg.workgroup
      ? `<div class="meta">
          <span><span class="key">WORKGROUP</span>
            <span class="val"><a href="${escapeHtml(agg.workgroup.url)}" target="_blank" rel="noopener">${escapeHtml(agg.workgroup.name)}</a></span>
          </span>
        </div>`
      : '';

    const sharedChipsHtml = sharedChips(agg.links).map(renderChip).join('');

    return `<div class="ig-card">
      <div class="ig-shared">
        <div class="title-row">
          <span class="title">${escapeHtml(agg.name)}</span>
          <span class="pkg-id">${escapeHtml(agg.identifier)}</span>
        </div>
        <div class="description">${escapeHtml(agg.description)}</div>
        ${workgroupMeta}
      </div>
      <div class="versions">
        ${versions.map(renderVersionRow).join('')}
      </div>
      ${sharedChipsHtml ? `<div class="shared-chips">${sharedChipsHtml}</div>` : ''}
    </div>`;
  }

  function renderGroup(group, view, ballotKind) {
    const cards = group.items.map(agg => renderIgCard(agg, view, ballotKind)).join('');
    return `<div class="org-group">
      <div class="org-header">
        <div class="left">
          <span class="by">By</span>
          <h2>${escapeHtml(group.name)}</h2>
          <span class="id">/${escapeHtml(group.id)}</span>
        </div>
        <div class="count">${group.count} guide${group.plural}</div>
      </div>
      ${cards}
    </div>`;
  }

  function renderGroups(groups, view, ballotKind) {
    return groups.map(g => renderGroup(g, view, ballotKind)).join('');
  }

  // ─── DOM updates ────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function applyTabClasses(v) {
    // Top tabs (All / Published / Under Ballot)
    el('tab-all').classList.toggle('active', state.view === 'all');
    el('tab-published').classList.toggle('active', state.view === 'published');
    el('tab-ballot').classList.toggle('active', state.view === 'ballot');

    // Ballot sub-tab bar visibility
    el('subtabs').style.display = v.isBallotView ? 'block' : 'none';

    // Sub-tabs (All / STU / DSTU)
    el('subtab-all').classList.toggle('active', state.ballotKind === 'all');
    el('subtab-stu').classList.toggle('active', state.ballotKind === 'stu');
    el('subtab-dstu').classList.toggle('active', state.ballotKind === 'dstu');

    // FHIR pills (ALL / R4 / R5)
    el('fhir-all').classList.toggle('active', state.fhirFilter === '');
    el('fhir-r4').classList.toggle('active', state.fhirFilter === '4.0.1');
    el('fhir-r5').classList.toggle('active', state.fhirFilter === '5.0.0');
  }

  function render() {
    const v = compute();

    // Hero stats
    el('hero-published').textContent = v.published.length;
    el('hero-ballot').textContent    = v.ballot.length;
    el('hero-stu').textContent       = v.stu.length;
    el('hero-dstu').textContent      = v.dstu.length;

    // Sub-tab labels (Published/Ballot tab counts are intentionally not shown)
    el('subtab-all-count').textContent    = `(${v.ballot.length})`;
    el('subtab-stu-count').textContent    = `(${v.stu.length})`;
    el('subtab-dstu-count').textContent   = `(${v.dstu.length})`;

    applyTabClasses(v);

    // Registry list
    const root = el('registry-root');
    if (v.isEmpty) {
      root.innerHTML = `<div class="empty-state">— No guides in this category —</div>`;
    } else {
      root.innerHTML = renderGroups(v.groups, state.view, state.ballotKind);
    }
  }

  // ─── Event wiring ───────────────────────────────────────────────
  function wire() {
    // Tab + sub-tab + FHIR pill clicks via data-action.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      switch (a) {
        case 'view-all':       setState({ view: 'all' });       break;
        case 'view-published': setState({ view: 'published' }); break;
        case 'view-ballot':    setState({ view: 'ballot' });    break;
        case 'kind-all':       setState({ ballotKind: 'all' }); break;
        case 'kind-stu':       setState({ ballotKind: 'stu' }); break;
        case 'kind-dstu':      setState({ ballotKind: 'dstu' });break;
        case 'fhir-all':       setState({ fhirFilter: '' });    break;
        case 'fhir-r4':        setState({ fhirFilter: '4.0.1' });break;
        case 'fhir-r5':        setState({ fhirFilter: '5.0.0' });break;
      }
    });

    // Search input.
    el('search-input').addEventListener('input', (e) => setState({ search: e.target.value }));
  }

  // ─── Dev-only validation ────────────────────────────────────────
  // Runs only on localhost / 127.0.0.1 / file:// — same spirit as
  // load-data.js's "uncurated IGs" console.warn. Surfaces mismatches
  // between the BALLOT_CYCLE switch and the actual catalog data.
  function isDev() {
    const h = location.hostname;
    return !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  function validateBallotCycle(igs) {
    if (!isDev()) return;
    const cycle = window.FHIR_CH_BALLOT_CYCLE;
    const underBallot = igs.filter(g => g.publicationStatus === 'under-ballot');
    const underBallotIds = new Set(underBallot.map(g => g.identifier));
    const allIds = new Set(igs.map(g => g.identifier));
    const warn = (msg) => console.warn('[ballot-cycle]', msg);

    if (!cycle) {
      if (underBallot.length) {
        warn(`BALLOT_CYCLE is null but ${underBallot.length} IG(s) are under-ballot: ${[...underBallotIds].join(', ')}. Set BALLOT_CYCLE in js/load-data.js to surface the Register button + VOTE chips.`);
      }
      return;
    }

    if (!cycle.registrationFormId) {
      warn('BALLOT_CYCLE.registrationFormId is empty — the hero "Register to vote" button will not appear.');
    }

    const formIds = Object.keys(cycle.forms || {});

    const stale = formIds.filter(id => !underBallotIds.has(id) && allIds.has(id));
    if (stale.length) {
      warn(`Stale entries in BALLOT_CYCLE.forms (these IGs are not under-ballot): ${stale.join(', ')}. Prune them.`);
    }

    const missing = [...underBallotIds].filter(id => !formIds.includes(id));
    if (missing.length) {
      warn(`Under-ballot IGs missing from BALLOT_CYCLE.forms (no VOTE chip will appear): ${missing.join(', ')}.`);
    }

    const typos = formIds.filter(id => !allIds.has(id));
    if (typos.length) {
      warn(`Unknown package-ids in BALLOT_CYCLE.forms (typo or stale): ${typos.join(', ')}.`);
    }

    if (cycle.year && underBallot.length) {
      const yearStr = String(cycle.year);
      const seenYears = [...new Set(
        underBallot
          .map(g => g.ballotCloses && g.ballotCloses.slice(0, 4))
          .filter(Boolean)
      )];
      if (seenYears.length && !seenYears.includes(yearStr)) {
        warn(`BALLOT_CYCLE.year is "${cycle.year}" but under-ballot IGs have ballotCloses year(s): ${seenYears.join(', ')}. Check OVERRIDES.ballotCloses.`);
      }
    }
  }

  // ─── Hero ballot toggle ─────────────────────────────────────────
  // Reads window.FHIR_CH_BALLOT_CYCLE (set synchronously by load-data.js).
  // Active cycle → Register button visible + primary; Join demoted to outline.
  // No cycle → Register hidden; Join restored to primary with trailing arrow.
  function applyBallotCycle() {
    const cycle = window.FHIR_CH_BALLOT_CYCLE;
    const vote  = document.getElementById('hero-vote-btn');
    const join  = document.getElementById('hero-join-btn');
    if (!vote || !join) return;
    if (cycle && cycle.registrationFormId) {
      vote.href        = `https://docs.google.com/forms/d/${cycle.registrationFormId}/viewform`;
      vote.textContent = `Register to vote · Ballot ${cycle.year} →`;
      vote.hidden      = false;
      join.classList.remove('primary');
      join.classList.add('outline');
      join.textContent = 'Join FHIR.ch work group calls';
    } else {
      vote.hidden      = true;
      join.classList.remove('outline');
      join.classList.add('primary');
      join.textContent = 'Join FHIR.ch work group calls →';
    }
  }

  // ─── Bootstrap ──────────────────────────────────────────────────
  function start() {
    applyBallotCycle();
    wire();
    // Initial render — shows empty state until data arrives.
    render();
    // Wait for IG data, then re-render with real values.
    (function tick() {
      if (window.FHIR_CH_IGS) {
        validateBallotCycle(window.FHIR_CH_IGS);
        render();
        return;
      }
      setTimeout(tick, 40);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
