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
  const ORG_ORDER = [
    'hl7ch', 'ehealth-suisse', 'foph', 'ech-hl7ch',
    'refdata', 'cara', 'sphn', 'swissnoso', 'openmedical', 'umzh'
  ];
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

  // ─── Compute pipeline ───────────────────────────────────────────
  function compute() {
    const all = window.FHIR_CH_IGS || [];
    const published  = all.filter(g => g.publicationStatus === 'published');
    const ballot     = all.filter(g => g.publicationStatus === 'under-ballot');
    const superseded = all.filter(g => g.publicationStatus === 'superseded');
    const stu        = ballot.filter(g => g.ballotType === 'stu');
    const dstu       = ballot.filter(g => g.ballotType === 'dstu');

    const isBallotView = state.view === 'ballot';
    const isAllView    = state.view === 'all';
    // Superseded IGs render alongside Published (per Oliver's "all IGs on
    // Published" overview ask) but are excluded from the hero counts.
    let active;
    if (isAllView) {
      active = published.concat(ballot).concat(superseded);
    } else if (isBallotView) {
      active = state.ballotKind === 'stu'  ? stu
             : state.ballotKind === 'dstu' ? dstu
             : ballot;
    } else {
      active = published.concat(superseded);
    }

    // Search filter
    const q = state.search.trim().toLowerCase();
    if (q) {
      active = active.filter(g =>
        (g.name||'').toLowerCase().includes(q) ||
        (g.identifier||'').toLowerCase().includes(q) ||
        (g.description||'').toLowerCase().includes(q)
      );
    }

    // FHIR version filter
    if (state.fhirFilter) {
      active = active.filter(g => (g.fhirVersion||[]).includes(state.fhirFilter));
    }

    // Group by organization
    const byOrg = new Map();
    for (const ig of active) {
      const k = ig.organization.id;
      if (!byOrg.has(k)) byOrg.set(k, { name: ig.organization.name, id: k, items: [] });
      byOrg.get(k).items.push(ig);
    }

    const groups = [...byOrg.values()]
      .sort((a, b) => {
        const ai = ORG_ORDER.indexOf(a.id);
        const bi = ORG_ORDER.indexOf(b.id);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((g, gi) => {
        g.items.sort((a, b) => {
          // Superseded IGs sink to the bottom of their org group.
          const aSup = a.publicationStatus === 'superseded' ? 1 : 0;
          const bSup = b.publicationStatus === 'superseded' ? 1 : 0;
          if (aSup !== bSup) return aSup - bSup;
          return (b.date || '').localeCompare(a.date || '');
        });
        return {
          ...g,
          indexLabel: String(gi + 1).padStart(2, '0'),
          count: g.items.length,
          plural: g.items.length === 1 ? '' : 's'
        };
      });

    return {
      all, published, ballot, stu, dstu, superseded,
      groups,
      isBallotView,
      isEmpty: groups.length === 0
    };
  }

  // ─── Chip + badge factories ─────────────────────────────────────
  function badgeFor(ig) {
    if (ig.publicationStatus === 'superseded')  return { cls: 'badge superseded', text: 'SUPERSEDED' };
    const isBallot = ig.publicationStatus === 'under-ballot';
    if (!isBallot)                    return { cls: 'badge published', text: 'PUBLISHED' };
    if (ig.ballotType === 'stu')      return { cls: 'badge stu',       text: 'STU BALLOT' };
    return                                  { cls: 'badge dstu',      text: 'DSTU BALLOT' };
  }

  function chipsFor(ig) {
    const isBallot = ig.publicationStatus === 'under-ballot';
    const chips = [];
    const L = ig.links || {};
    if (L.ig)      chips.push({ cls: isBallot ? 'chip danger' : 'chip primary', icon: '▤', label: isBallot ? 'BALLOT IG' : 'IG',     url: L.ig });
    if (L.ciBuild) chips.push({ cls: 'chip secondary', icon: '⟳', label: 'CI BUILD', url: L.ciBuild });
    if (L.history) chips.push({ cls: 'chip secondary', icon: '↺', label: 'HISTORY',  url: L.history });
    if (L.source)  chips.push({ cls: 'chip secondary', icon: '◉', label: 'GITHUB',   url: L.source });
    if (L.wiki)    chips.push({ cls: 'chip ghost',     icon: '📓', label: 'WIKI',    url: L.wiki });
    if (L.jira)    chips.push({ cls: 'chip ghost',     icon: '✎', label: 'JIRA',    url: L.jira });
    return chips;
  }

  // ─── Template renderers ─────────────────────────────────────────
  function renderChip(chip) {
    return `<a class="${chip.cls}" href="${escapeHtml(chip.url)}" target="_blank" rel="noopener">`
      + `<span class="icon">${chip.icon}</span><span>${escapeHtml(chip.label)}</span></a>`;
  }

  function renderIgCard(ig) {
    const isBallot = ig.publicationStatus === 'under-ballot';
    const isSuperseded = ig.publicationStatus === 'superseded';
    const badge = badgeFor(ig);
    const chips = chipsFor(ig).map(renderChip).join('');
    const fhirVersionStr = (ig.fhirVersion || []).join(', ') || '—';
    const dateLabel = isBallot ? 'BALLOT CLOSES' : 'PUBLISHED';
    const dateValue = isBallot ? fmtDate(ig.ballotCloses) : fmtDate(ig.date);
    const versionStr = ig.version ? `v${escapeHtml(ig.version)}` : '—';

    const supersededNote = isSuperseded && ig.supersededBy
      ? `<div class="superseded-note">Superseded by <a href="${escapeHtml(ig.supersededBy.url)}" target="_blank" rel="noopener">${escapeHtml(ig.supersededBy.name)}</a>.</div>`
      : '';

    const workgroupMeta = ig.workgroup
      ? `<span class="sep">·</span>
         <span><span class="key">WORKGROUP</span>
           <span class="val"><a href="${escapeHtml(ig.workgroup.url)}" target="_blank" rel="noopener">${escapeHtml(ig.workgroup.name)}</a></span>
         </span>`
      : '';

    return `<div class="ig-card${isSuperseded ? ' is-superseded' : ''}">
      <div>
        <div class="title-row">
          <span class="title">${escapeHtml(ig.name)}</span>
          <span class="pkg-id">${escapeHtml(ig.identifier)}</span>
          <span class="${badge.cls}">${badge.text}</span>
        </div>
        <div class="description">${escapeHtml(ig.description)}</div>
        ${supersededNote}
        <div class="meta">
          <span><span class="key">VERSION</span> <span class="val">${versionStr}</span></span>
          <span class="sep">·</span>
          <span><span class="key">FHIR</span> <span class="val">${escapeHtml(fhirVersionStr)}</span></span>
          <span class="sep">·</span>
          <span><span class="key">${dateLabel}</span> <span class="val">${dateValue}</span></span>
          ${workgroupMeta}
        </div>
      </div>
      <div class="links-cluster">
        <div class="links-row">${chips}</div>
      </div>
    </div>`;
  }

  function renderGroup(group) {
    const cards = group.items.map(renderIgCard).join('');
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

  function renderGroups(groups) {
    return groups.map(renderGroup).join('');
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
      root.innerHTML = renderGroups(v.groups);
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

  // ─── Bootstrap ──────────────────────────────────────────────────
  function start() {
    wire();
    // Initial render — shows empty state until data arrives.
    render();
    // Wait for IG data, then re-render with real values.
    (function tick() {
      if (window.FHIR_CH_IGS) { render(); return; }
      setTimeout(tick, 40);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
