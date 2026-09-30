/* ベンチプレス伸び計算機: 画面の処理（フォーム・描画・保存・共有） */
(function () {
  'use strict';
  const BG = window.BG;
  const D = BG.DATA;

  const STORAGE_KEY = 'benchgoal:v1';

  const form = document.getElementById('calc-form');
  const errorBox = document.getElementById('form-error');
  const maxField = document.getElementById('max-field');
  const repsField = document.getElementById('reps-field');
  const estOut = document.getElementById('est-out');
  const resultSection = document.getElementById('result');
  const summaryMeta = document.getElementById('summary-meta');
  const bigRange = document.getElementById('big-range');
  const rateLine = document.getElementById('rate-line');
  const chartBox = document.getElementById('chart-box');
  const verdictBox = document.getElementById('verdict');
  const studyList = document.getElementById('study-list');
  const studyNote = document.getElementById('study-note');
  const formulaBox = document.getElementById('formula-box');
  const repsBody = document.querySelector('#reps-table tbody');
  const programLink = document.getElementById('program-link');
  const shareBtn = document.getElementById('share-btn');
  const shareBox = document.getElementById('share-box');
  const shareInput = document.getElementById('share-url');
  const shareStatus = document.getElementById('share-status');

  let current = null;

  // ---- 小さな DOM ヘルパー（文字列は必ず textContent として入れる） ----
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(k => {
        const v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    children.flat(Infinity).forEach(c => {
      if (c == null || c === false) return;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  const kg = x => (Math.round(x * 10) / 10).toString();
  const kg0 = x => Math.round(x).toString();
  const pct1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const cite = (anchor, text) => h('a', { class: 'cite-chip', href: 'evidence.html#' + anchor, text: text || '根拠' });
  const sexName = s => (s === 'female' ? '女性' : '男性');

  // ---- フォームの状態 ----
  function readForm() {
    const e = form.elements;
    return { sex: e.sex.value, bw: e.bw.value, mode: e.mode.value, max: e.max.value, liftW: e.liftW.value, liftR: e.liftR.value, weeks: e.weeks.value, target: e.target.value };
  }

  function setRadio(name, value) {
    const match = Array.from(form.querySelectorAll('input[name="' + name + '"]')).find(i => i.value === String(value));
    if (match) match.checked = true;
  }

  function applyState(s) {
    if (!s || typeof s !== 'object') return;
    const e = form.elements;
    ['bw', 'max', 'liftW', 'liftR', 'target'].forEach(k => { if (s[k] != null) e[k].value = s[k]; });
    if (s.weeks != null) e.weeks.value = String(s.weeks);
    if (s.mode) setRadio('mode', s.mode);
    if (s.sex) setRadio('sex', s.sex);
    syncMode();
  }

  function currentEstimate(s) {
    return s.mode === 'reps' ? BG.estimateAll(s.liftW, s.liftR) : null;
  }
  function currentMax(s) {
    if (s.mode === 'reps') {
      const e = currentEstimate(s);
      return e ? e.main : null;
    }
    const m = Number(s.max);
    return m > 0 ? m : null;
  }

  function syncMode() {
    const s = readForm();
    const reps = s.mode === 'reps';
    maxField.hidden = reps;
    repsField.hidden = !reps;
    const e = currentEstimate(s);
    estOut.textContent = reps && e ? '推定MAX：' + kg(e.main) + 'kg（Brzycki の式）' + (e.capped ? '・10回として計算' : '') : '';
  }

  // ---- 保存（使えないブラウザでも動くように try/catch で囲む） ----
  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* 保存できなくても続行 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ---- URL での共有 ----
  function toParams(n) {
    const p = new URLSearchParams();
    p.set('sx', n.sex === 'female' ? 'f' : 'm');
    p.set('bw', kg(n.bw));
    p.set('m', kg(n.max));
    p.set('wk', String(n.weeks));
    if (n.target) p.set('t', kg(n.target));
    return p;
  }
  function fromParams(search) {
    const p = new URLSearchParams(search);
    if (!p.has('m')) return null;
    return {
      sex: p.get('sx') === 'f' ? 'female' : 'male',
      bw: p.get('bw') || '',
      mode: 'max',
      max: p.get('m') || '',
      weeks: p.get('wk') || String(D.defaultWeeks),
      target: p.get('t') || ''
    };
  }
  const baseUrl = () => location.href.split(/[?#]/)[0];
  function updateUrl(n) {
    try { history.replaceState(null, '', '?' + toParams(n).toString()); } catch (e) { /* file:// などで失敗しても続行 */ }
  }

  // ---- 描画: 予測 ----
  function renderPrediction(n, p) {
    summaryMeta.textContent = sexName(n.sex) + '・今のMAX ' + kg(n.max) + 'kg・体重 ' + kg(n.bw) + 'kg（体重の' + p.ratio.toFixed(2) + '倍）・' + n.weeks + '週間';
    bigRange.replaceChildren(
      h('span', { class: 'big-label', text: n.weeks + '週間後の予想MAX' }),
      h('span', { class: 'big-num', text: kg0(p.lowMax) + '〜' + kg0(p.highMax) + 'kg' }),
      h('span', { class: 'big-gain', text: '+' + kg0(p.lowGain) + '〜' + kg0(p.highGain) + 'kg（+' + pct1(p.lowPct) + '〜' + pct1(p.highPct) + '%）' })
    );
    const notes = [
      h('li', null, sexName(n.sex) + 'で体重の' + p.ratio.toFixed(2) + '倍の人は、研究では1週あたり約' + pct1(p.rates.low) + '〜' + pct1(p.rates.high) + '%伸びています。今のMAXが体重に比べて軽いほど、速く伸びます。', cite('rate'))
    ];
    const upper = D.anchors[n.sex][D.anchors[n.sex].length - 2].ratio;
    if (n.sex === 'female' && p.ratio > D.anchors.female[1].ratio) notes.push(h('li', null, '体重の' + D.anchors.female[1].ratio + '倍を超える女性の研究は見つからなかったため、男性の研究から推定しています。', cite('sex')));
    else if (n.sex === 'male' && p.ratio > upper) notes.push(h('li', null, '体重の' + upper + '倍を超える男性の研究はほとんどないため、控えめに推定しています。', cite('rate')));
    if (n.weeks > D.fullRateWeeks) notes.push(h('li', null, (D.fullRateWeeks + 1) + '週目からは半分のペースで計算しています。24週間の研究でも、この計算とよく合っていました。', cite('long')));
    notes.push(h('li', null, 'MAXを測り慣れていない人は、測るだけで数%上がることがあります。予測の伸びには、その分も含まれます。', cite('practice')));
    rateLine.replaceChildren(...notes);
    chartBox.replaceChildren(BG.chart.bandChart(p, n.target));
  }

  // ---- 描画: 目標の判定 ----
  function renderVerdict(n, p) {
    if (!n.target) {
      verdictBox.hidden = true;
      return;
    }
    const v = BG.verdict(p, n.target);
    const need = BG.weeksNeeded(n.max, n.bw, n.target, n.sex);
    const titles = { likely: '届く見込みが高い目標です', possible: '研究の範囲内の目標です', beyond: n.weeks + '週間では届きにくい目標です' };
    const lines = [];
    if (v === 'likely') {
      lines.push('+' + kg(n.target) + 'kgは、研究で見られた控えめなペースでも' + n.weeks + '週間で届く伸びです。');
    } else if (v === 'possible') {
      lines.push('+' + kg(n.target) + 'kgは、研究で見られた速いペースなら' + n.weeks + '週間で届きます。控えめなペースだと' + (need.slowest ? '約' + need.slowest + '週' : '1年以上') + 'かかります。');
    } else {
      lines.push('研究で見られた速いペースでも、' + n.weeks + '週間の伸びは+' + kg0(p.highGain) + 'kgまでです。');
      if (need.fastest) {
        lines.push('+' + kg(n.target) + 'kgには、速いペースで約' + need.fastest + '週、控えめなペースで' + (need.slowest ? '約' + need.slowest + '週' : '1年以上') + 'が目安です。' + (need.slowest == null || need.slowest > D.maxWeeks ? '16週より先は研究が少ないため、あくまで目安です。' : ''));
      } else {
        lines.push('1年以上かかる見込みです。大会に出ている人の記録でも、ベンチプレスの伸びは1年で最大10〜13kgほどでした。');
      }
      lines.push(n.weeks + '週間なら、+' + kg0(p.lowGain) + '〜' + kg0(p.highGain) + 'kgが現実的な目標です。');
    }
    verdictBox.className = 'verdict verdict-' + v;
    verdictBox.replaceChildren(
      h('p', { class: 'verdict-title', text: titles[v] }),
      ...lines.map(t => h('p', { text: t })),
      h('p', { class: 'verdict-cite' }, cite('rate', '判定のもとになった研究'), v === 'beyond' ? cite('long', '長い期間の伸び') : null)
    );
    verdictBox.hidden = false;
  }

  // ---- 描画: 近い研究 ----
  function renderStudies(n, p) {
    const near = BG.nearestStudies(p.ratio, n.sex, 3);
    studyNote.textContent = n.sex === 'female'
      ? '女性のベンチプレスの研究は少なく、使えるものは2本です。'
      : '体重比が近いグループを、研究ごとに1つずつ選んでいます。';
    studyList.replaceChildren(...near.map(s => {
      const r = D.refs[s.ref];
      const yours = n.max * BG.gainPct(n.weeks, s.effRate) / 100;
      return h('li', { class: 'study' },
        h('div', { class: 'study-top' },
          h('span', { class: 'study-ratio', text: '体重の' + (s.approxRatio ? '約' : '') + s.ratio.toFixed(2) + '倍' }),
          h('a', { class: 'study-ref', href: 'https://doi.org/' + r.doi, rel: 'noopener', text: r.short })
        ),
        h('p', { class: 'study-who', text: s.who + (s.group ? '（' + s.group + '）' : '') + '・' + s.how }),
        h('p', { class: 'study-result', text: s.weeks + '週間で ' + kg(s.pre) + 'kg → +' + kg(s.gain) + 'kg（+' + pct1(s.pct) + '%）' }),
        h('p', { class: 'study-yours', text: 'この伸び方をあなたの' + n.weeks + '週間に当てはめると、約+' + kg0(yours) + 'kg' })
      );
    }));
  }

  // ---- 描画: MAXの計算式と、重さごとの回数 ----
  function renderFormulas(s) {
    const e = currentEstimate(s);
    if (!e) {
      formulaBox.replaceChildren(h('p', { class: 'hint', text: '「重さ×回数から推定」を選ぶと、ここに4つの式で計算したMAXが並びます。' }));
      return;
    }
    formulaBox.replaceChildren(...[
      h('p', null, kg(e.weight) + 'kgを' + e.reps + '回挙げたときのMAXは、式によって' + kg(e.min) + '〜' + kg(e.max) + 'kgです。この計算機は Brzycki の式の値を使います。'),
      e.capped ? h('p', { class: 'hint', text: '10回を超えると、どの式も誤差が大きくなります。10回として計算しています。' }) : null,
      h('div', { class: 'table-wrap' },
        h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: '式' }), h('th', { scope: 'col', text: 'MAX' }), h('th', { scope: 'col', text: '特徴' }))),
          h('tbody', null, e.list.map(f => h('tr', { class: f.main ? 'is-main' : null },
            h('th', { scope: 'row', text: f.name + (f.main ? '（使う式）' : '') }),
            h('td', { class: 'cell-num', text: kg(f.value) + 'kg' }),
            h('td', { text: f.note })
          )))
        )
      )
    ].filter(Boolean));
  }

  function renderRepsTable(n) {
    repsBody.replaceChildren(...BG.repsTableFor(n.max).map(r => h('tr', null,
      h('th', { scope: 'row', text: r.pct + '%' }),
      h('td', { class: 'cell-num', text: kg(r.weight) + 'kg' }),
      h('td', { class: 'cell-num', text: '平均 ' + r.mean.toFixed(1) + 'rep' }),
      h('td', { class: 'cell-num', text: r.lo + '〜' + r.hi + 'rep' })
    )));
  }

  function updateProgramLink(n) {
    const p = new URLSearchParams();
    p.set('m', kg(n.max));
    p.set('bw', kg(n.bw));
    p.set('sx', n.sex === 'female' ? 'f' : 'm');
    if ([4, 6, 8, 10, 12].indexOf(n.weeks) >= 0) p.set('wk', String(n.weeks));
    const href = '/bench-program/?' + p.toString();
    programLink.href = href;
    const btn = document.getElementById('program-link-btn');
    if (btn) btn.href = href;
  }

  // ---- 計算 ----
  function calculate(scroll) {
    const s = readForm();
    const n = BG.normalizeInput({ sex: s.sex, max: currentMax(s), bw: s.bw, weeks: s.weeks, target: s.target });
    const errors = BG.validate(n);
    if (errors.length) {
      errorBox.replaceChildren(...errors.map(t => h('span', { class: 'error-line', text: t })));
      errorBox.hidden = false;
      return false;
    }
    errorBox.hidden = true;
    const p = BG.predict(n.max, n.bw, n.weeks, n.sex);
    current = n;
    renderPrediction(n, p);
    renderVerdict(n, p);
    renderStudies(n, p);
    renderFormulas(s);
    renderRepsTable(n);
    updateProgramLink(n);
    resultSection.hidden = false;
    shareBox.hidden = true;
    save(s);
    updateUrl(n);
    if (scroll) resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    calculate(true);
  });
  form.addEventListener('change', e => { if (e.target.name === 'mode') syncMode(); });
  form.addEventListener('input', e => { if (e.target.name === 'liftW' || e.target.name === 'liftR') syncMode(); });

  shareBtn.addEventListener('click', async () => {
    if (!current) return;
    const url = baseUrl() + '?' + toParams(current).toString();
    shareInput.value = url;
    shareBox.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      shareStatus.textContent = 'リンクをコピーしました。開くと同じ結果が表示されます。';
    } catch (e) {
      shareInput.focus();
      shareInput.select();
      shareStatus.textContent = 'リンクを選択しました。コピーして共有してください。';
    }
  });

  // ---- 起動時: URL のパラメータ → 前回の入力 の順で復元 ----
  const initial = fromParams(location.search) || load();
  if (initial) {
    applyState(initial);
    if (initial.bw && currentMax(readForm())) calculate(false);
    else if (!initial.bw) form.elements.bw.focus();
  } else {
    syncMode();
  }
})();
