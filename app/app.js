// Leonida Trophy Guide: checklist tracker (localStorage), filters, spoiler
// setting, export/import, trophy detail pane and the platinum roadmap.
// Static and offline: the only file it loads is data/trophies.json, served
// from this same folder. Source links come from that data file, never from
// code here, so the app makes no network request of its own.
(function () {
  'use strict';

  var PROGRESS_KEY = 'gta6-trophy-guide-progress-v1';
  var SETTINGS_KEY = 'gta6-trophy-guide-settings-v1';
  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  var demoMode = shot !== null;

  // Demo progress for screenshot scenes (?shot=...): in-memory only, so a
  // screenshot never overwrites the reader's real saved progress.
  var DEMO_EARNED = [2, 3, 8, 15, 16, 21, 35, 42, 44, 45, 50, 51, 52, 53];
  var KIND_LABELS = {
    story: 'Story', missable: 'Missable', collectibles: 'Collectibles',
    activities: 'Activities', exploration: 'Exploration', combat: 'Combat',
  };
  var STAGES = [
    { n: 1, title: 'Stage 1 — Play the story first', blurb: 'Five chapters, roughly 60–80 hours. Story trophies pop as you play; protect the one possibly-missable meditation in Chapter 1 and keep chapter saves.' },
    { n: 2, title: 'Stage 2 — Side strands & activities', blurb: 'Optional questlines, stranger strands, races, shooting ranges and the odd one-off moments. Everything here stays available after the story.' },
    { n: 3, title: 'Stage 3 — Collectibles & grinds', blurb: 'Stunts, scans, vehicles, cards, robberies and the money trophies. The long, satisfying mop-up across Leonida.' },
    { n: 4, title: 'Stage 4 — 100% Completion, then platinum', blurb: 'Open the checklist after the story (Progress > Stats > 100% Completion), finish it for “A Long Road”, and the platinum follows.' },
  ];

  var trophies = [];
  var earned = new Set();
  var selectedId = null;
  var state = { grade: 'all', kind: 'all', query: '', spoiler: false, tab: 'checklist' };

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('trophyList'), detailEl = $('detail'), stagesEl = $('stages');

  function readProgress() {
    if (demoMode) return new Set(DEMO_EARNED);
    try {
      var raw = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter(function (id) { return Number.isInteger(id); }) : []);
    } catch (e) { return new Set(); }
  }
  function saveProgress() {
    if (demoMode) return;
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(Array.from(earned).sort(function (a, b) { return a - b; }))); } catch (e) { /* storage unavailable: progress just lasts the session */ }
  }
  function readSettings() {
    try {
      var s = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s && typeof s.spoiler === 'boolean') state.spoiler = s.spoiler;
    } catch (e) { /* ignore */ }
  }
  function saveSettings() {
    if (demoMode) return;
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ spoiler: state.spoiler })); } catch (e) { /* ignore */ }
  }

  function byId(id) {
    for (var i = 0; i < trophies.length; i++) if (trophies[i].id === id) return trophies[i];
    return null;
  }
  function isHiddenFromReader(t) {
    return state.spoiler && t.kind === 'story' && !earned.has(t.id);
  }
  function matchesFilters(t) {
    if (state.grade !== 'all' && t.grade !== state.grade) return false;
    if (state.kind !== 'all' && t.kind !== state.kind) return false;
    if (state.query) {
      var q = state.query.toLowerCase();
      var hay = (t.name + ' ' + t.description + ' ' + t.guide).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function renderProgress() {
    var total = trophies.length;
    $('progressText').textContent = earned.size + ' of ' + total + ' earned';
    $('barFill').style.width = total ? (earned.size / total * 100) + '%' : '0%';
    $('barWrap').setAttribute('aria-valuenow', String(earned.size));
    var grades = ['platinum', 'gold', 'silver', 'bronze'];
    $('gradeCounts').textContent = grades.map(function (g) {
      var got = trophies.filter(function (t) { return t.grade === g && earned.has(t.id); }).length;
      var all = trophies.filter(function (t) { return t.grade === g; }).length;
      return g.charAt(0).toUpperCase() + g.slice(1) + ' ' + got + '/' + all;
    }).join(' · ');
  }

  function renderList() {
    listEl.replaceChildren();
    var shown = 0;
    trophies.forEach(function (t) {
      if (!matchesFilters(t)) return;
      shown++;
      var li = el('li', 'trophy' + (earned.has(t.id) ? ' earned' : '') + (selectedId === t.id ? ' selected' : ''));
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = earned.has(t.id);
      box.setAttribute('aria-label', 'Mark ' + (isHiddenFromReader(t) ? 'story trophy' : t.name) + ' as earned');
      box.addEventListener('change', function () {
        if (box.checked) earned.add(t.id); else earned.delete(t.id);
        saveProgress(); renderProgress(); renderList(); renderDetail();
      });
      li.appendChild(box);
      var mid = el('div');
      if (isHiddenFromReader(t)) {
        mid.appendChild(el('div', 'trophy-name', 'Hidden story trophy'));
        mid.appendChild(el('div', 'spoiler-note', 'Hidden story trophy — earn it to reveal.'));
      } else {
        mid.appendChild(el('div', 'trophy-name', t.name));
        mid.appendChild(el('div', 'trophy-desc', t.description));
      }
      var meta = el('div', 'trophy-meta');
      meta.appendChild(el('span', 'tag', KIND_LABELS[t.kind] || t.kind));
      if (t.hidden) meta.appendChild(el('span', 'tag hidden-flag', 'Hidden on PSN'));
      if (t.missable) meta.appendChild(el('span', 'tag missable', 'Possibly missable'));
      if (t.count) meta.appendChild(el('span', 'tag', 'Target: ' + t.count.toLocaleString('en-US')));
      mid.appendChild(meta);
      li.appendChild(mid);
      li.appendChild(el('span', 'grade-badge grade-' + t.grade, t.grade));
      li.addEventListener('click', function (ev) {
        if (ev.target === box) return;
        selectedId = t.id;
        renderList(); renderDetail();
        detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      listEl.appendChild(li);
    });
    $('resultCount').textContent = shown + ' of ' + trophies.length + ' trophies shown';
  }

  function renderDetail() {
    detailEl.replaceChildren();
    var t = selectedId === null ? null : byId(selectedId);
    if (!t) {
      detailEl.appendChild(el('p', 'detail-empty', 'Select a trophy to see its guide, steps and sources.'));
      return;
    }
    var hidden = isHiddenFromReader(t);
    detailEl.appendChild(el('h2', null, hidden ? 'Hidden story trophy' : t.name));
    if (!hidden) detailEl.appendChild(el('p', 'official', 'Official description: “' + t.description + '”'));
    var chips = el('div', 'chips');
    chips.appendChild(el('span', 'grade-badge grade-' + t.grade, t.grade));
    chips.appendChild(el('span', 'tag', KIND_LABELS[t.kind] || t.kind));
    if (t.hidden) chips.appendChild(el('span', 'tag hidden-flag', 'Hidden on PSN until earned'));
    if (t.count) chips.appendChild(el('span', 'tag', 'Target: ' + t.count.toLocaleString('en-US')));
    detailEl.appendChild(chips);
    if (t.missable) {
      detailEl.appendChild(el('p', 'warn-box', '⚠ Possibly missable — the only trophy reported as possibly missable. Read the warning in the guide below before you play Chapter 1.'));
    }
    if (hidden) {
      detailEl.appendChild(el('p', 'spoiler-note', 'Spoilers are hidden for this story trophy until you earn it. Tick its box to reveal the guide.'));
      return;
    }
    if (t.guide.indexOf('Unconfirmed at launch') !== -1) {
      detailEl.appendChild(el('p', 'unconfirmed', '⚠ Unconfirmed at launch — no verified method exists yet. This guide says what is known and does not invent a method.'));
    }
    detailEl.appendChild(el('h3', null, 'How to get it'));
    detailEl.appendChild(el('p', null, t.guide));
    if (t.steps && t.steps.length) {
      detailEl.appendChild(el('h3', null, 'Steps'));
      var ol = el('ol');
      t.steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
      detailEl.appendChild(ol);
    }
    if (t.sources && t.sources.length) {
      detailEl.appendChild(el('h3', null, 'Sources'));
      var ul = el('ul', 'sources');
      t.sources.forEach(function (s) {
        var li = el('li');
        var a = document.createElement('a');
        a.href = s.url; a.textContent = s.name; a.target = '_blank'; a.rel = 'noopener';
        li.appendChild(a);
        ul.appendChild(li);
      });
      detailEl.appendChild(ul);
    }
  }

  function renderRoadmap() {
    stagesEl.replaceChildren();
    STAGES.forEach(function (stage) {
      var members = trophies.filter(function (t) { return t.stage === stage.n; });
      var done = members.filter(function (t) { return earned.has(t.id); }).length;
      var li = el('li', 'stage');
      var h = el('h2');
      h.appendChild(document.createTextNode(stage.title + ' '));
      h.appendChild(el('span', null, done + '/' + members.length + ' earned'));
      li.appendChild(h);
      li.appendChild(el('p', null, stage.blurb));
      var ul = el('ul');
      members.forEach(function (t) {
        var item = el('li');
        item.appendChild(el('span', 'g g-' + t.grade));
        item.appendChild(document.createTextNode((isHiddenFromReader(t) ? 'Hidden story trophy' : t.name) + (t.missable ? ' — possibly missable' : '')));
        ul.appendChild(item);
      });
      li.appendChild(ul);
      stagesEl.appendChild(li);
    });
  }

  function setTab(tab) {
    state.tab = tab;
    $('tabChecklist').classList.toggle('active', tab === 'checklist');
    $('tabRoadmap').classList.toggle('active', tab === 'roadmap');
    $('tabChecklist').setAttribute('aria-pressed', String(tab === 'checklist'));
    $('tabRoadmap').setAttribute('aria-pressed', String(tab === 'roadmap'));
    $('viewChecklist').classList.toggle('hidden', tab !== 'checklist');
    $('viewRoadmap').classList.toggle('hidden', tab !== 'roadmap');
    if (tab === 'roadmap') renderRoadmap();
  }

  function applyShotScene() {
    if (!demoMode) return;
    if (shot === 'roadmap') { setTab('roadmap'); }
    else if (shot === 'guide') { selectedId = 14; }
    else if (shot === 'filters') {
      state.grade = 'silver'; state.spoiler = true; selectedId = 15;
      $('gradeFilter').value = 'silver'; $('spoilerToggle').checked = true;
    } else if (shot === 'cover') { selectedId = 28; }
  }

  function init(data) {
    trophies = data.trophies || [];
    earned = readProgress();
    readSettings();
    $('spoilerToggle').checked = state.spoiler;

    $('search').addEventListener('input', function (e) { state.query = e.target.value.trim(); renderList(); });
    $('gradeFilter').addEventListener('change', function (e) { state.grade = e.target.value; renderList(); });
    $('kindFilter').addEventListener('change', function (e) { state.kind = e.target.value; renderList(); });
    $('spoilerToggle').addEventListener('change', function (e) {
      state.spoiler = e.target.checked; saveSettings(); renderList(); renderDetail(); renderRoadmap();
    });
    $('tabChecklist').addEventListener('click', function () { setTab('checklist'); });
    $('tabRoadmap').addEventListener('click', function () { setTab('roadmap'); });
    $('exportBtn').addEventListener('click', function () {
      var payload = { game: 'Grand Theft Auto VI', guide: 'Leonida Trophy Guide', earned: Array.from(earned).sort(function (a, b) { return a - b; }) };
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      a.download = 'gta6-trophy-progress.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $('importFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var ids = Array.isArray(data) ? data : data.earned;
          if (!Array.isArray(ids)) throw new Error('no earned list');
          var valid = new Set(trophies.map(function (t) { return t.id; }));
          var next = new Set();
          ids.forEach(function (id) { if (valid.has(id)) next.add(id); });
          earned = next; saveProgress();
          renderProgress(); renderList(); renderDetail();
        } catch (err) {
          window.alert('That file is not a Leonida Trophy Guide progress export.');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('Clear all earned trophies?')) return;
      earned = new Set(); saveProgress();
      renderProgress(); renderList(); renderDetail(); renderRoadmap();
    });

    applyShotScene();
    renderProgress(); renderList(); renderDetail(); renderRoadmap();
    window.__shotReady = true;
  }

  fetch('data/trophies.json')
    .then(function (r) { if (!r.ok) throw new Error('trophies.json failed to load'); return r.json(); })
    .then(init)
    .catch(function (err) {
      detailEl.replaceChildren();
      detailEl.appendChild(el('p', 'detail-empty', 'Could not load the trophy list: ' + err.message));
      window.__shotReady = true;
    });
})();
