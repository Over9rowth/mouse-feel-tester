const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fitLeastSquaresCircle,
  analyzeCircleTrace,
  analyzeFlickLine,
  analyzePollingStability
} = require('../src/domain/mouse-feel.cjs');

test('1. 最小二乘圆拟合：偏心理想圆精确还原圆心与半径', () => {
  // 构造圆心在 (312.5, 188.2)、半径为 120 的理想圆轨迹
  const cx = 312.5;
  const cy = 188.2;
  const R = 120.0;
  const points = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    points.push({
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
      t: deg * 5
    });
  }

  const fitted = fitLeastSquaresCircle(points);
  assert.ok(Math.abs(fitted.centerX - cx) < 0.05, `圆心X偏离: ${fitted.centerX}`);
  assert.ok(Math.abs(fitted.centerY - cy) < 0.05, `圆心Y偏离: ${fitted.centerY}`);
  assert.ok(Math.abs(fitted.radius - R) < 0.05, `半径偏离: ${fitted.radius}`);

  const traceResult = analyzeCircleTrace(points);
  assert.ok(traceResult.radialRmsPx < 0.05, `理想圆残差过大: ${traceResult.radialRmsPx}`);
});

test('2. 叠加高频微抖动的圆轨迹抖动与顿挫计数检出', () => {
  const cx = 200;
  const cy = 200;
  const R = 100;
  const points = [];

  // 叠加每 30 度产生一次明显的 ±3px 顿挫微抖动
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    const jitter = Math.sin(deg * 12 * (Math.PI / 180)) * 3.5;
    points.push({
      x: cx + (R + jitter) * Math.cos(rad),
      y: cy + (R + jitter) * Math.sin(rad),
      t: deg * 4
    });
  }

  const res = analyzeCircleTrace(points);
  assert.ok(res.highFreqJitterRmsPx > 1.5, `未检出高频抖动: ${res.highFreqJitterRmsPx}`);
  assert.ok(res.stutterCount >= 5, `未检出顿挫计数: ${res.stutterCount}`);
});

test('3. 直线甩枪急停：理想无过冲测试', () => {
  const start = { x: 100, y: 100 };
  const end = { x: 500, y: 100 };
  const points = [];

  // 从 (100, 100) 匀速移动到 (500, 100)，完全停在终点
  for (let x = 100; x <= 500; x += 10) {
    points.push({ x, y: 100, t: (x - 100) * 2 });
  }

  const res = analyzeFlickLine(points, start, end);
  assert.equal(res.targetDistancePx, 400);
  assert.equal(res.overshootPx, 0);
  assert.equal(res.lateralDeviationRmsPx, 0);
});

test('4. 直线甩枪急停：超调过冲与回拉修正耗时量化', () => {
  const start = { x: 100, y: 100 };
  const end = { x: 400, y: 100 };
  const points = [];

  // 从 100 冲到 450（过冲 50px），然后再回拉到 400
  let t = 0;
  for (let x = 100; x <= 450; x += 10) {
    points.push({ x, y: 100 + (x % 20 === 0 ? 2 : 0), t: (t += 5) });
  }
  for (let x = 440; x >= 400; x -= 10) {
    points.push({ x, y: 100, t: (t += 8) });
  }

  const res = analyzeFlickLine(points, start, end);
  assert.equal(res.targetDistancePx, 300);
  assert.equal(res.overshootPx, 50);
  assert.ok(res.overshootRatioPct > 15);
  assert.ok(res.settleTimeMs > 0);
});

test('5. 鼠标回报率稳定性与丢包卡顿跳变统计', () => {
  const points = [];
  let t = 1000;
  // 构造标准 1000Hz (1ms 间隔) 采样流，并在中间注入 3 次 15ms 的严重丢包卡顿
  for (let i = 0; i < 200; i++) {
    const dt = (i === 50 || i === 100 || i === 150) ? 15 : 1;
    t += dt;
    points.push({ x: i, y: i, t });
  }

  const polling = analyzePollingStability(points);
  assert.ok(polling.sampleCount >= 200);
  assert.ok(polling.dropSpikeCount >= 3, `跳变计数不足: ${polling.dropSpikeCount}`);
});

test('6. 平滑度分数综合映射与极值鲁棒性', () => {
  const points = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    points.push({
      x: 150 + 80 * Math.cos(rad),
      y: 150 + 80 * Math.sin(rad),
      t: deg * 2
    });
  }
  const res = analyzeCircleTrace(points);
  assert.ok(res.smoothnessScore >= 95, `理想圆平滑度过低: ${res.smoothnessScore}`);
});

// =================== 反向对照测试 (Reverse-Contrast) ===================

test('7. [反向对照1] 若拟合圆心退化为固定画布原点 (0, 0)，偏心理想圆残差断言必须变红(FAIL)', () => {
  // 圆心偏在 (300, 300)、半径 100
  const points = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    points.push({
      x: 300 + 100 * Math.cos(rad),
      y: 300 + 100 * Math.sin(rad),
      t: deg * 5
    });
  }

  // 正常算法通过
  const good = analyzeCircleTrace(points);
  assert.ok(good.radialRmsPx < 0.1);

  // 退化实现：假算法（直接假设圆心在 (0, 0)）
  function degradedTrace(pts) {
    const sum = pts.reduce((s, p) => s + Math.hypot(p.x, p.y), 0);
    const meanR = sum / pts.length;
    const rms = Math.sqrt(pts.reduce((s, p) => s + Math.pow(Math.hypot(p.x, p.y) - meanR, 2), 0) / pts.length);
    return { radialRmsPx: rms };
  }
  const bad = degradedTrace(points);

  assert.throws(() => {
    assert.ok(bad.radialRmsPx < 0.1, '固定假原点无法拟合偏心圆，断言必须变红');
  }, /AssertionError/);
});

test('8. [反向对照2] 若将急停过冲退化为恒等于 0，超调甩枪测试必须变红(FAIL)', () => {
  const start = { x: 100, y: 100 };
  const end = { x: 400, y: 100 };
  const points = [
    { x: 100, y: 100, t: 0 },
    { x: 450, y: 100, t: 100 }, // 严重超调 50px
    { x: 400, y: 100, t: 150 }
  ];

  const good = analyzeFlickLine(points, start, end);
  assert.equal(good.overshootPx, 50);

  // 退化实现：假急停分析（恒不报错过冲）
  function degradedFlick() {
    return { overshootPx: 0 };
  }
  const bad = degradedFlick();

  assert.throws(() => {
    assert.equal(bad.overshootPx, 50, '退化急停无法测量过冲超调');
  }, /AssertionError/);
});
