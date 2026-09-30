/* ベンチプレス伸び計算機: データ（研究の数字と計算の設定） */
(function (root) {
  'use strict';
  const BG = root.BG = root.BG || {};

  BG.DATA = {
    minWeeks: 4,
    maxWeeks: 16,
    defaultWeeks: 8,
    step: 2.5,
    // 伸びる速さ（1週あたり、始めのMAXに対する%）。体重比の点のあいだは直線でつなぐ。
    // 男性は研究の点に合わせた幅。1.8倍の点は研究がないため控えめに置いた推定。
    // 女性は研究が少ないため、0.65倍までは女性の研究、それより上は男性の幅を
    // 体重比 × 0.69（男女の上位10%の体重比の比）で置きかえた推定。
    anchors: {
      male: [
        { ratio: 0.8, low: 1.8, high: 3.5 },
        { ratio: 1.2, low: 0.6, high: 1.5 },
        { ratio: 1.5, low: 0.4, high: 1.2 },
        { ratio: 1.8, low: 0.2, high: 0.8, estimated: true }
      ],
      female: [
        { ratio: 0.5, low: 1.2, high: 2.5 },
        { ratio: 0.65, low: 1.0, high: 2.2 },
        { ratio: 0.83, low: 0.6, high: 1.5, estimated: true },
        { ratio: 1.04, low: 0.4, high: 1.2, estimated: true },
        { ratio: 1.24, low: 0.2, high: 0.8, estimated: true }
      ]
    },
    sexRatio: 0.69,
    // 8週目までは同じペース、9週目からは半分のペース
    fullRateWeeks: 8,
    lateFactor: 0.5,
    searchWeeks: 52,

    // グラフと「近い研究」に使う研究のグループ（pre と gain は kg）
    studies: [
      { id: 'ogasawara', ref: 'ogasawara2012', sex: 'male', who: '筋トレ未経験の日本人男性', group: '', ratio: 0.78, weeks: 12, pre: 51.0, gain: 17.7, how: '週3回・MAXの75%で10回×3セット' },
      { id: 'kikuchi', ref: 'kikuchi2017', sex: 'male', who: '筋トレ経験1年以上の男子学生', group: 'ベンチプレス群', ratio: 0.93, weeks: 8, pre: 60.0, gain: 5.0, how: '週2回・MAXの40%の軽い重さで限界まで', approxRatio: true },
      { id: 'schoenfeld-5', ref: 'schoenfeld2019', sex: 'male', who: '筋トレ経験者の男性', group: '1種目5セット', ratio: 1.10, weeks: 8, pre: 91.1, gain: 6.8, how: '週3回・8〜12回を限界まで', approxRatio: true },
      { id: 'schoenfeld-1', ref: 'schoenfeld2019', sex: 'male', who: '筋トレ経験者の男性', group: '1種目1セット', ratio: 1.13, weeks: 8, pre: 93.6, gain: 9.3, how: '週3回・8〜12回を限界まで', approxRatio: true },
      { id: 'mangine-vol', ref: 'mangine2015', sex: 'male', who: '筋トレ経験者の男性', group: '軽めで回数の多い群', ratio: 1.16, weeks: 8, pre: 104.5, gain: 6.4, how: 'MAXの70%で10〜12回×4セット' },
      { id: 'schoenfeld-3', ref: 'schoenfeld2019', sex: 'male', who: '筋トレ経験者の男性', group: '1種目3セット', ratio: 1.17, weeks: 8, pre: 96.4, gain: 5.7, how: '週3回・8〜12回を限界まで', approxRatio: true },
      { id: 'mangine-int', ref: 'mangine2015', sex: 'male', who: '筋トレ経験者の男性', group: '重めで回数の少ない群', ratio: 1.21, weeks: 8, pre: 108.8, gain: 15.0, how: 'MAXの90%で3〜5回×4セット' },
      { id: 'colquhoun-6', ref: 'colquhoun2018', sex: 'male', who: '筋トレ経験者の男性', group: '週6回', ratio: 1.22, weeks: 6, pre: 102.3, gain: 8.8, how: '週の量は同じで、回数だけ変えた' },
      { id: 'colquhoun-3', ref: 'colquhoun2018', sex: 'male', who: '筋トレ経験者の男性', group: '週3回', ratio: 1.28, weeks: 6, pre: 101.4, gain: 7.8, how: '週の量は同じで、回数だけ変えた' },
      { id: 'travis-exp', ref: 'travis2021', sex: 'male', who: 'パワーリフティング選手（男性14人・女性2人）', group: '3週かけて軽くした群', ratio: 1.28, weeks: 6, pre: 114.8, gain: 11.5, how: '追い込む週のあとに量を減らして測定', approxRatio: true },
      { id: 'decamargo', ref: 'decamargo2023', sex: 'male', who: '筋トレ経験者の男性', group: 'プラセボ群', ratio: 1.32, weeks: 8, pre: 109.8, gain: 6.6, how: '胸の日を週2回・12回を限界まで', approxRatio: true },
      { id: 'travis-step', ref: 'travis2021', sex: 'male', who: 'パワーリフティング選手（男性14人・女性2人）', group: '最後に1週軽くした群', ratio: 1.36, weeks: 6, pre: 122.2, gain: 13.2, how: '追い込む週のあとに量を減らして測定', approxRatio: true },
      { id: 'helms-pct', ref: 'helms2018', sex: 'male', who: '2年以上の経験者の男性', group: '%で重さを決めた群', ratio: 1.42, weeks: 8, pre: 113.9, gain: 9.6, how: '週3回・日ごとに回数を変える方式' },
      { id: 'helms-rpe', ref: 'helms2018', sex: 'male', who: '2年以上の経験者の男性', group: 'きつさで重さを決めた群', ratio: 1.53, weeks: 8, pre: 120.9, gain: 10.7, how: '週3回・日ごとに回数を変える方式' },
      { id: 'cholewa', ref: 'cholewa2018', sex: 'female', who: '筋トレ未経験の女性', group: 'プラセボ群', ratio: 0.50, weeks: 8, pre: 33.7, gain: 4.9, how: '上半身の日を週1回・3セットを限界まで' },
      { id: 'rossi-pbt', ref: 'rossi2024', sex: 'female', who: '体育学部の女子学生', group: '%で重さを決めた群', ratio: 0.60, weeks: 6, pre: 39.3, gain: 3.4, how: '週2回' },
      { id: 'rossi-vbt', ref: 'rossi2024', sex: 'female', who: '体育学部の女子学生', group: '挙げる速さで重さを決めた群', ratio: 0.62, weeks: 6, pre: 38.7, gain: 5.6, how: '週2回' }
    ],

    // 重さと回数から MAX を出す式（w: 重さ、r: 限界まで挙げた回数）
    formulas: [
      { id: 'brzycki', name: 'Brzycki', main: true, note: '10回以下で最も正確だった（男性220人のベンチプレス）' },
      { id: 'epley', name: 'Epley', note: 'よく使われる式。ベンチではやや高めに出やすい' },
      { id: 'mayhew', name: 'Mayhew', note: 'ベンチプレスのデータから作られた式' },
      { id: 'lombardi', name: 'Lombardi', note: '回数が多いときの差が小さい式' }
    ],
    maxReps: 10,

    // ベンチプレスで限界まで挙げられる平均の回数と、人によるばらつき（標準偏差）
    // Nuzzo 2024 の表（269の研究のメタ回帰）
    repsTable: [
      { pct: 95, mean: 2.59, sd: 1.25 },
      { pct: 90, mean: 4.11, sd: 1.46 },
      { pct: 85, mean: 6.23, sd: 1.71 },
      { pct: 80, mean: 8.82, sd: 1.99 },
      { pct: 75, mean: 11.51, sd: 2.33 },
      { pct: 70, mean: 14.08, sd: 2.72 },
      { pct: 65, mean: 16.59, sd: 3.17 },
      { pct: 60, mean: 19.34, sd: 3.70 }
    ],

    refs: {
      ogasawara2012: { short: 'Ogasawara 2012', doi: '10.1556/imas.4.2012.4.7' },
      kikuchi2017: { short: 'Kikuchi 2017', doi: '10.1016/j.jesf.2017.06.003' },
      schoenfeld2019: { short: 'Schoenfeld 2019', doi: '10.1249/MSS.0000000000001764' },
      mangine2015: { short: 'Mangine 2015', doi: '10.14814/phy2.12472' },
      colquhoun2018: { short: 'Colquhoun 2018', doi: '10.1519/JSC.0000000000002414' },
      travis2021: { short: 'Travis 2021', doi: '10.3389/fphys.2021.735932' },
      decamargo2023: { short: 'de Camargo 2023', doi: '10.5114/biolsport.2023.112967' },
      helms2018: { short: 'Helms 2018', doi: '10.3389/fphys.2018.00247' },
      cholewa2018: { short: 'Cholewa 2018', doi: '10.1186/s12970-018-0243-x' },
      rossi2024: { short: 'Rossi 2024', doi: '10.1016/j.heliyon.2024.e30644' }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
