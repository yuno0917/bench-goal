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
  const formulaCard = document.getElementById('formula-card');
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
    summaryMeta.textContent = sexName(n.sex) + '・MAX ' + kg(n.max) + 'kg・体重 ' + kg(n.bw) + 'kg（' + p.ratio.toFixed(2) + '倍）・' + n.weeks + '週間';
    bigRange.replaceChildren(
      h('span', { class: 'big-label', text: n.weeks + '週間後の予想MAX' }),
      h('span', { class: 'big-num', text: kg0(p.lowMax) + '〜' + kg0(p.highMax) + 'kg' }),
      h('span', { class: 'big-gain', text: '+' + kg0(p.lowGain) + '〜' + kg0(p.highGain) + 'kg（+' + pct1(p.lowPct) + '〜' + pct1(p.highPct) + '%）' })
    );
    const line = [
      '帯は、研究で見られた伸びの幅です。' + sexName(n.sex) + 'で体重の' + p.ratio.toFixed(2) + '倍の人は、1週あたり約' + pct1(p.rates.low) + '〜' + pct1(p.rates.high) + '%伸びていました。', cite('rate')
    ];
    const upper = D.anchors[n.sex][D.anchors[n.sex].length - 2].ratio;
    if (n.sex === 'female' && p.ratio > D.anchors.female[1].ratio) line.push(' 体重の' + D.anchors.female[1].ratio + '倍を超える女性の研究は見つからなかったため、男性の研究から推定しています。', cite('sex'));
    else if (n.sex === 'male' && p.ratio > upper) line.push(' 体重の' + upper + '倍を超える男性の研究はほとんどないため、控えめに推定しています。', cite('rate'));
    if (n.weeks > D.fullRateWeeks) line.push(' ' + (D.fullRateWeeks + 1) + '週目からは半分のペースで計算しています。', cite('long'));
    rateLine.replaceChildren(...line);
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
    const slow = need.slowest ? '約' + need.slowest + '週' : '1年以上';
    const titles = { likely: '届く見込みが高い目標です', possible: '研究の範囲内の目標です', beyond: n.weeks + '週間では届きにくい目標です' };
    let text;
    if (v === 'likely') {
      text = '控えめなペースでも、' + n.weeks + '週間で+' + kg(n.target) + 'kgに届きます。';
    } else if (v === 'possible') {
      text = '速いペースなら' + n.weeks + '週間で届きます。控えめなペースだと' + slow + 'かかります。';
    } else if (need.fastest) {
      text = '速いペースでも' + n.weeks + '週間では+' + kg0(p.highGain) + 'kgまでです。+' + kg(n.target) + 'kgには、約' + need.fastest + '週〜' + (need.slowest ? need.slowest + '週' : '1年以上') + 'かかる見込みです。';
    } else {
      text = '1年以上かかる見込みです。大会に出ている人でも、ベンチプレスの伸びは1年で最大10〜13kgほどでした。';
    }
    verdictBox.className = 'verdict verdict-' + v;
    verdictBox.replaceChildren(h('p', { class: 'verdict-title', text: titles[v] }), h('p', { text: text }));
    verdictBox.hidden = false;
  }

  // ---- 描画: 近い研究 ----
  function renderStudies(n, p) {
    const near = BG.nearestStudies(p.ratio, n.sex, 3);
    studyNote.textContent = n.sex === 'female' ? '女性のベンチプレスの研究は少なく、使えるものは2本です。' : '';
    studyNote.hidden = n.sex !== 'female';
    studyList.replaceChildren(...near.map(s => {
      const r = D.refs[s.ref];
      const yours = n.max * BG.gainPct(n.weeks, s.effRate) / 100;
      return h('li', { class: 'study' },
        h('div', { class: 'study-top' },
          h('span', { class: 'study-ratio', text: '体重の' + (s.approxRatio ? '約' : '') + s.ratio.toFixed(2) + '倍の人' }),
          h('a', { class: 'study-ref', href: 'https://doi.org/' + r.doi, rel: 'noopener', text: r.short })
        ),
        h('p', { class: 'study-result', text: s.weeks + '週間で+' + pct1(s.pct) + '%' },
          ' ', h('span', { class: 'study-yours', text: '→ あなたなら約+' + kg0(yours) + 'kg' }))
      );
    }));
  }

  // ---- 描画: MAXの計算式と、重さごとの回数 ----
  function renderFormulas(s) {
    const e = currentEstimate(s);
    formulaCard.hidden = !e;
    if (!e) return;
    formulaBox.replaceChildren(...[
      h('p', null, kg(e.weight) + 'kgを' + e.reps + '回挙げたときのMAXは、式によって' + kg(e.min) + '〜' + kg(e.max) + 'kgです。計算には Brzycki の式を使います。どの式も、10回以下のときに正確です。', cite('formulas')),
      e.capped ? h('p', { class: 'hint', text: '10回を超えると、どの式も誤差が大きくなるため、10回として計算しています。' }) : null,
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
      h('td', { class: 'cell-num', text: r.mean.toFixed(1) + 'rep（' + r.lo + '〜' + r.hi + '）' })
    )));
  }

  function updateProgramLink(n) {
    const p = new URLSearchParams();
    p.set('m', kg(n.max));
    p.set('bw', kg(n.bw));
    p.set('sx', n.sex === 'female' ? 'f' : 'm');
    if ([4, 6, 8, 10, 12].indexOf(n.weeks) >= 0) p.set('wk', String(n.weeks));
    programLink.href = '/bench-program/?' + p.toString();
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
