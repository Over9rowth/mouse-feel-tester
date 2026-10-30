// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
/**
 * 鼠标手感仪 (mouse-feel-tester) - 核心算法域
 * 100% 按照 SPEC.md 锁定的 Kåsa 最小二乘圆拟合与物理学公式实现
 */

/**
 * Kåsa 代数最小二乘法拟合最佳圆心 (centerX, centerY) 与半径 radius
 * 严禁假设固定圆心，必须基于任意输入点集求解线性代数方程
 */
function fitLeastSquaresCircle(points) {
  if (!points || points.length < 3) {
    return { centerX: 0, centerY: 0, radius: 0 };
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  let sumZ = 0;
  let sumXZ = 0;
  let sumYZ = 0;

  for (let i = 0; i < n; i++) {
    const x = points[i].x;
    const y = points[i].y;
    const z = x * x + y * y;

    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
    sumZ += z;
    sumXZ += x * z;
    sumYZ += y * z;
  }

  // 构造 3x3 线性方程组求 A * x_c + B * y_c + C = 0 的系数
  // [ sumX2  sumXY  sumX ] [ -2 * cx ]   [ -sumXZ ]
  // [ sumXY  sumY2  sumY ] [ -2 * cy ] = [ -sumYZ ]
  // [ sumX   sumY   n    ] [    C    ]   [ -sumZ  ]
  const M = [
    [sumX2, sumXY, sumX],
    [sumXY, sumY2, sumY],
    [sumX, sumY, n]
  ];
  const B = [sumXZ, sumYZ, sumZ];

  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);

  if (Math.abs(det) < 1e-9) {
    return { centerX: sumX / n, centerY: sumY / n, radius: 0 };
  }

  // 克莱姆法则求解
  function solveDet(colIdx) {
    const Mc = M.map(row => [...row]);
    for (let r = 0; r < 3; r++) {
      Mc[r][colIdx] = B[r];
    }
    return (
      Mc[0][0] * (Mc[1][1] * Mc[2][2] - Mc[1][2] * Mc[2][1]) -
      Mc[0][1] * (Mc[1][0] * Mc[2][2] - Mc[1][2] * Mc[2][0]) +
      Mc[0][2] * (Mc[1][0] * Mc[2][1] - Mc[1][1] * Mc[2][0])
    );
  }

  const p1 = solveDet(0) / det;
  const p2 = solveDet(1) / det;
  const p3 = solveDet(2) / det;

  const centerX = Number((p1 / 2).toFixed(3));
  const centerY = Number((p2 / 2).toFixed(3));
  const radVal = (centerX * centerX) + (centerY * centerY) + p3;
  const radius = radVal > 0 ? Number(Math.sqrt(radVal).toFixed(3)) : 0;

  return { centerX, centerY, radius };
}

/**
 * 轨迹画圆径向残差与高频微抖动分析
 */
function analyzeCircleTrace(points) {
  if (!points || points.length < 5) {
    return {
      centerX: 0,
      centerY: 0,
      radius: 0,
      radialRmsPx: 0,
      highFreqJitterRmsPx: 0,
      maxPeakToPeakPx: 0,
      stutterCount: 0,
      stutterAnglesDeg: [],
      smoothnessScore: 0
    };
  }

  const { centerX, centerY, radius } = fitLeastSquaresCircle(points);

  const n = points.length;
  const residuals = new Array(n);
  const angles = new Array(n);

  for (let i = 0; i < n; i++) {
    const dx = points[i].x - centerX;
    const dy = points[i].y - centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    residuals[i] = r - radius;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    angles[i] = Number(deg.toFixed(1));
  }

  // 1. 全局径向均方根 (RMS)
  const sumSq = residuals.reduce((s, r) => s + r * r, 0);
  const radialRmsPx = Number(Math.sqrt(sumSq / n).toFixed(3));

  // 2. 移动平均窗口大小：根据采样点密度适配低频手部偏心 trend (窗口过小会把高频抖动也平滑掉)
  // 当采样点较密时（如每圈 > 100 点），取更宽的窗口（如 15~21 点）才能保留真实高频微抖动
  const halfWin = Math.max(3, Math.min(15, Math.floor(n / 20)));
  const hf = new Array(n);
  for (let i = 0; i < n; i++) {
    let wSum = 0;
    let wCount = 0;
    for (let k = -halfWin; k <= halfWin; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < n) {
        wSum += residuals[idx];
        wCount++;
      }
    }
    const trend = wSum / wCount;
    hf[i] = residuals[i] - trend;
  }

  const hfSumSq = hf.reduce((s, val) => s + val * val, 0);
  const highFreqJitterRmsPx = Number(Math.sqrt(hfSumSq / n).toFixed(3));

  // 3. 最大峰谷差与顿挫极值统计 (|hf_i| > 2.0 px 且为局部极值)
  let minHf = Infinity;
  let maxHf = -Infinity;
  const stutterAnglesDeg = [];

  for (let i = 0; i < n; i++) {
    if (hf[i] < minHf) minHf = hf[i];
    if (hf[i] > maxHf) maxHf = hf[i];

    if (Math.abs(hf[i]) > 2.0) {
      const prev = i > 0 ? hf[i - 1] : 0;
      const next = i < n - 1 ? hf[i + 1] : 0;
      // 局部极大或极小
      if ((hf[i] > prev && hf[i] > next) || (hf[i] < prev && hf[i] < next)) {
        stutterAnglesDeg.push(angles[i]);
      }
    }
  }

  const maxPeakToPeakPx = Number((maxHf - minHf).toFixed(2));
  const stutterCount = stutterAnglesDeg.length;

  // 平滑度分数 (0~100)
  const smoothnessScore = Number(Math.max(0, Math.min(100, 100 - (highFreqJitterRmsPx * 20) - (stutterCount * 5))).toFixed(1));

  return {
    centerX,
    centerY,
    radius,
    radialRmsPx,
    highFreqJitterRmsPx,
    maxPeakToPeakPx,
    stutterCount,
    stutterAnglesDeg,
    smoothnessScore
  };
}

/**
 * 直线急停与过冲超调量化
 */
function analyzeFlickLine(points, startTarget, endTarget) {
  if (!points || points.length < 2) {
    return {
      targetDistancePx: 0,
      lateralDeviationRmsPx: 0,
      maxProjectionPx: 0,
      overshootPx: 0,
      overshootRatioPct: 0,
      settleTimeMs: 0
    };
  }

  const dx = endTarget.x - startTarget.x;
  const dy = endTarget.y - startTarget.y;
  const targetDistancePx = Math.sqrt(dx * dx + dy * dy);

  if (targetDistancePx === 0) {
    return {
      targetDistancePx: 0,
      lateralDeviationRmsPx: 0,
      maxProjectionPx: 0,
      overshootPx: 0,
      overshootRatioPct: 0,
      settleTimeMs: 0
    };
  }

  const ux = dx / targetDistancePx;
  const uy = dy / targetDistancePx;

  let maxProjection = -Infinity;
  let maxProjIdx = 0;
  let sumSqLateral = 0;

  for (let i = 0; i < points.length; i++) {
    const px = points[i].x - startTarget.x;
    const py = points[i].y - startTarget.y;

    // 沿主轴投影距离
    const proj = px * ux + py * uy;
    if (proj > maxProjection) {
      maxProjection = proj;
      maxProjIdx = i;
    }

    // 垂直横向偏差 (二维叉积绝对值)
    const lateral = Math.abs(px * uy - py * ux);
    sumSqLateral += lateral * lateral;
  }

  const lateralDeviationRmsPx = Number(Math.sqrt(sumSqLateral / points.length).toFixed(2));
  const maxProjectionPx = Number(maxProjection.toFixed(2));
  const overshootPx = Number(Math.max(0, maxProjectionPx - targetDistancePx).toFixed(2));
  const overshootRatioPct = Number(((overshootPx / targetDistancePx) * 100).toFixed(1));

  // 回拉修正耗时
  let settleTimeMs = 0;
  if (overshootPx > 0 && maxProjIdx < points.length - 1) {
    const tOver = points[maxProjIdx].t;
    const tEnd = points[points.length - 1].t;
    settleTimeMs = Math.max(0, Math.round(tEnd - tOver));
  }

  return {
    targetDistancePx: Number(targetDistancePx.toFixed(2)),
    lateralDeviationRmsPx,
    maxProjectionPx,
    overshootPx,
    overshootRatioPct,
    settleTimeMs
  };
}

/**
 * 采样回报率与时间间隔稳定性
 */
function analyzePollingStability(points) {
  if (!points || points.length < 3) {
    return {
      sampleCount: 0,
      meanIntervalMs: 0,
      estimatedHz: 0,
      intervalJitterStdMs: 0,
      dropSpikeCount: 0
    };
  }

  const intervals = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    // 排除无效非正间隔或长时间静止停顿 (> 100ms)
    if (dt > 0 && dt <= 100) {
      intervals.push(dt);
    }
  }

  if (intervals.length === 0) {
    return {
      sampleCount: points.length,
      meanIntervalMs: 0,
      estimatedHz: 0,
      intervalJitterStdMs: 0,
      dropSpikeCount: 0
    };
  }

  const sum = intervals.reduce((a, b) => a + b, 0);
  const meanIntervalMs = Number((sum / intervals.length).toFixed(2));
  const estimatedHz = meanIntervalMs > 0 ? Math.round(1000 / meanIntervalMs) : 0;

  // 方差与标准差
  const variance = intervals.reduce((s, dt) => s + Math.pow(dt - meanIntervalMs, 2), 0) / intervals.length;
  const intervalJitterStdMs = Number(Math.sqrt(variance).toFixed(2));

  // 中位数
  const sorted = [...intervals].sort((a, b) => a - b);
  const medianDt = sorted[Math.floor(sorted.length / 2)];

  // 跳变/丢包计数 (dt > 2.5 * medianDt)
  const dropSpikeCount = intervals.filter(dt => dt > 2.5 * medianDt).length;

  return {
    sampleCount: points.length,
    meanIntervalMs,
    estimatedHz,
    intervalJitterStdMs,
    dropSpikeCount
  };
}

module.exports = {
  fitLeastSquaresCircle,
  analyzeCircleTrace,
  analyzeFlickLine,
  analyzePollingStability
};
