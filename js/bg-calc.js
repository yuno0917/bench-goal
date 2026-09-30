/* ベンチプレス伸び計算機: 計算（DOM に触れない純粋な関数） */
(function (root) {
  'use strict';
  const BG = root.BG = root.BG || {};
  const D = BG.DATA;

  const EPS = 1e-9;
  const roundTo = (x, step) => Math.round(x / step) * step;
  const r2 = x => Math.round(x * 100) / 100;

  // ---- 重さと回数から MAX を出す式 ----
  const FORMULAS = {
    brzycki: (w, r) => w / (1.0278 - 0.0278 * r),
    epley: (w, r) => w * (1 + r / 30),
    mayhew: (w, r) => 100 * w / (52.2 + 41.9 * Math.exp(-0.055 * r)),
    lombardi: (w, r) => w * Math.pow(r, 0.1)
  };

  // すべての式で MAX を出す。1回ならその重さ。10回を超える回数は10回として計算する。
  function estimateAll(weight, reps) {
    const w = Number(weight);
    const raw = Math.round(Number(reps));
    if (!(w > 0) || !(raw >= 1)) return null;
    const r = Math.min(raw, D.maxReps);
    const list = D.formulas.map(f => ({ id: f.id, name: f.name, main: !!f.main, note: f.note, value: r === 1 ? w : r2(FORMULAS[f.id](w, r)) }));
    const values = list.map(x => x.value);
    return {
      weight: w, reps: raw, used: r, capped: raw > D.maxReps, list,
      min: Math.min(...values), max: Math.max(...values),
      main: list.find(x => x.main).value
    };
  }

  // 計算に使う MAX（Brzycki の式）
  function estimate1RM(weight, reps) {
    const e = estimateAll(weight, reps);
    return e ? e.main : null;
  }

  // ---- 伸びの速さ ----
  function ratesFor(ratio, sex) {
    if (!(ratio > 0)) return null;
    const a = D.anchors[sex === 'female' ? 'female' : 'male'];
    const first = a[0];
    const last = a[a.length - 1];
    if (ratio <= first.ratio) return { low: first.low, high: first.high };
    if (ratio >= last.ratio) return { low: last.low, high: last.high };
    const hit = a.find(p => Math.abs(p.ratio - ratio) < EPS);
    if (hit) return { low: hit.low, high: hit.high };
    for (let i = 0; i < a.length - 1; i++) {
      const p = a[i];
      const q = a[i + 1];
      if (ratio <= q.ratio) {
        const t = (ratio - p.ratio) / (q.ratio - p.ratio);
        return { low: p.low + (q.low - p.low) * t, high: p.high + (q.high - p.high) * t };
      }
    }
    return null;
  }

  // weeks 週間の伸び（%）。8週までは rate のまま、9週目からは半分のペース。
  function gainPct(weeks, rate) {
    const full = Math.min(weeks, D.fullRateWeeks);
    const late = Math.max(0, weeks - D.fullRateWeeks);
    return rate * full + rate * D.lateFactor * late;
  }

  // 研究のグループの伸び（%）。effRate は、9週目から半分のペースとして8週までのペースに直した1週あたりの伸び
  function studyRate(s) {
    const pct = s.gain / s.pre * 100;
    return { pct, perWeek: pct / s.weeks, effRate: pct / gainPct(s.weeks, 1) };
  }

  // 研究のグループの伸びが、同じ性別・体重比・週数の予測の幅に入るか
  function studyPosition(s) {
    const r = ratesFor(s.ratio, s.sex);
    const pct = studyRate(s).pct;
    if (pct < gainPct(s.weeks, r.low) - EPS) return 'below';
    if (pct > gainPct(s.weeks, r.high) + EPS) return 'above';
    return 'inside';
  }

  function bandCoverage(sex) {
    const list = D.studies.filter(s => !sex || s.sex === sex);
    return {
      inside: list.filter(s => studyPosition(s) === 'inside').length,
      above: list.filter(s => studyPosition(s) === 'above').length,
      below: list.filter(s => studyPosition(s) === 'below').length,
      total: list.length
    };
  }

  function predict(max, bw, weeks, sex) {
    const ratio = max / bw;
    const rates = ratesFor(ratio, sex);
    const lowPct = gainPct(weeks, rates.low);
    const highPct = gainPct(weeks, rates.high);
    const curve = [];
    for (let w = 0; w <= weeks; w++) {
      curve.push({ week: w, low: max * (1 + gainPct(w, rates.low) / 100), high: max * (1 + gainPct(w, rates.high) / 100) });
    }
    return {
      max, bw, weeks, sex, ratio, rates, lowPct, highPct,
      lowGain: max * lowPct / 100,
      highGain: max * highPct / 100,
      lowMax: max * (1 + lowPct / 100),
      highMax: max * (1 + highPct / 100),
      curve
    };
  }

  function weeksNeeded(max, bw, targetGain, sex) {
    const rates = ratesFor(max / bw, sex);
    const find = rate => {
      for (let w = 1; w <= D.searchWeeks; w++) {
        if (max * gainPct(w, rate) / 100 >= targetGain - EPS) return w;
      }
      return null;
    };
    return { fastest: find(rates.high), slowest: find(rates.low) };
  }

  // likely: 控えめなペースでも届く / possible: 研究の範囲内 / beyond: 範囲の外
  function verdict(pred, targetGain) {
    if (!(targetGain > 0)) return null;
    if (targetGain <= pred.lowGain + EPS) return 'likely';
    if (targetGain <= pred.highGain + EPS) return 'possible';
    return 'beyond';
  }

  // 同じ性別で体重比が近い研究を、同じ論文が重ならないように選ぶ
  function nearestStudies(ratio, sex, n) {
    const limit = n || 3;
    const sorted = D.studies
      .filter(s => s.sex === (sex === 'female' ? 'female' : 'male'))
      .map(s => ({ s, d: Math.abs(s.ratio - ratio) }))
      .sort((a, b) => a.d - b.d || a.s.ratio - b.s.ratio);
    const seen = new Set();
    const out = [];
    for (const x of sorted) {
      if (seen.has(x.s.ref)) continue;
      seen.add(x.s.ref);
      out.push(Object.assign({}, x.s, studyRate(x.s)));
      if (out.length >= limit) break;
    }
    return out;
  }

  // 今の MAX で、それぞれの割合の重さなら何回くらいできるか
  function repsTableFor(max) {
    return D.repsTable.map(row => ({
      pct: row.pct,
      weight: Math.max(20, roundTo(max * row.pct / 100, D.step)),
      mean: row.mean,
      lo: Math.max(1, Math.round(row.mean - row.sd)),
      hi: Math.round(row.mean + row.sd)
    }));
  }

  function normalizeInput(input) {
    const i = input || {};
    const num = v => (v === '' || v == null ? NaN : Number(v));
    let weeks = Math.round(num(i.weeks));
    if (!(weeks >= D.minWeeks && weeks <= D.maxWeeks)) weeks = D.defaultWeeks;
    const t = num(i.target);
    return {
      sex: i.sex === 'female' ? 'female' : 'male',
      max: num(i.max),
      bw: num(i.bw),
      weeks,
      target: t > 0 && t <= 150 ? t : null
    };
  }

  function validate(n) {
    const errors = [];
    if (!(n.bw >= 30 && n.bw <= 200)) errors.push('体重を30〜200kgの範囲で入れてください。');
    if (!(n.max >= 10 && n.max <= 300)) errors.push('ベンチプレスのMAXを10〜300kgの範囲で入れてください。');
    return errors;
  }

  Object.assign(BG, {
    FORMULAS, estimateAll, estimate1RM, ratesFor, gainPct, studyRate, studyPosition, bandCoverage,
    predict, weeksNeeded, verdict, nearestStudies, repsTableFor, normalizeInput, validate
  });
})(typeof window !== 'undefined' ? window : globalThis);
