// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  analyzeCircleTrace,
  analyzeFlickLine,
  analyzePollingStability,
  CircleTraceAnalysis,
  FlickLineAnalysis,
  PollingStabilityAnalysis,
  TimedPoint
} from '../domain/mouse-feel.cjs';

// 30 秒“诶”点内置对比样本构造器
function generateSampleTraces() {
  const circlePoints: TimedPoint[] = [];
  const cx = 240;
  const cy = 200;
  const R = 110;

  // 构造模拟磨损布垫的高频抖动轨迹
  for (let deg = 0; deg <= 360; deg += 3) {
    const rad = (deg * Math.PI) / 180;
    const jitter = Math.sin(deg * 8 * (Math.PI / 180)) * 2.8;
    circlePoints.push({
      x: cx + (R + jitter) * Math.cos(rad),
      y: cy + (R + jitter) * Math.sin(rad),
      t: deg * 4
    });
  }

  // 构造急停过冲样本
  const flickPoints: TimedPoint[] = [];
  let t = 0;
  for (let x = 80; x <= 460; x += 15) {
    flickPoints.push({ x, y: 150, t: (t += 6) });
  }
  for (let x = 450; x >= 400; x -= 10) {
    flickPoints.push({ x, y: 150, t: (t += 10) });
  }

  return { circlePoints, flickPoints };
}

declare global {
  interface Window {
    mousefeel?: {
      exportReportJson: (json: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: unknown) => Promise<void>;
    };
  }
}

export function App() {
  const [circleReport, setCircleReport] = useState<CircleTraceAnalysis | null>(null);
  const [flickReport, setFlickReport] = useState<FlickLineAnalysis | null>(null);
  const [pollingReport, setPollingReport] = useState<PollingStabilityAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'CIRCLE' | 'FLICK'>('CIRCLE');
  const [userPoints, setUserPoints] = useState<TimedPoint[]>([]);
  const isDrawing = useRef(false);

  const runAnalysis = (cPoints: TimedPoint[], fPoints: TimedPoint[]) => {
    const cRes = analyzeCircleTrace(cPoints);
    const fRes = analyzeFlickLine(fPoints, { x: 80, y: 150 }, { x: 400, y: 150 });
    const pRes = analyzePollingStability(cPoints);
    setCircleReport(cRes);
    setFlickReport(fRes);
    setPollingReport(pRes);
    return { circle: cRes, flick: fRes, polling: pRes };
  };

  useEffect(() => {
    const { circlePoints, flickPoints } = generateSampleTraces();
    const res = runAnalysis(circlePoints, flickPoints);

    if (window.mousefeel) {
      window.mousefeel.smokeReady({ mounted: true, engineOk: !!res.circle });
      window.mousefeel.onSmokeRun(() => {
        const fresh = generateSampleTraces();
        const rep = runAnalysis(fresh.circlePoints, fresh.flickPoints);
        window.mousefeel?.smokeResult({ report: rep });
      });
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const pt: TimedPoint = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, t: performance.now() };
    setUserPoints([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const pt: TimedPoint = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, t: performance.now() };
    setUserPoints(prev => [...prev, pt]);
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
    if (userPoints.length > 5) {
      if (activeTab === 'CIRCLE') {
        const cRes = analyzeCircleTrace(userPoints);
        setCircleReport(cRes);
        setPollingReport(analyzePollingStability(userPoints));
      } else {
        const start = userPoints[0];
        const end = userPoints[userPoints.length - 1];
        const fRes = analyzeFlickLine(userPoints, start, end);
        setFlickReport(fRes);
        setPollingReport(analyzePollingStability(userPoints));
      }
    }
  };

  const handleExportJson = async () => {
    if (!window.mousefeel) return;
    await window.mousefeel.exportReportJson(JSON.stringify({ circle: circleReport, flick: flickReport, polling: pollingReport }, null, 2));
  };

  const handleExportManual = async () => {
    if (!window.mousefeel) return;
    await window.mousefeel.exportManualPdf();
  };

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <h1 className="title">鼠标手感仪 <span className="version">v0.1.0</span></h1>
          <span className="badge">100% 本机离线</span>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => { const s = generateSampleTraces(); runAnalysis(s.circlePoints, s.flickPoints); setUserPoints([]); }}>
            重载内置对照样本
          </button>
          <button className="btn btn-secondary" onClick={handleExportManual}>
            导出说明书 (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportJson}>
            导出体检数据 (JSON)
          </button>
        </div>
      </header>

      <div className="honest-banner">
        【仪器观测边界】本工具基于 Kåsa 代数最小二乘法与物理轨迹残差度量，严禁硬编码虚构圆心与指标，仅作外设与垫子物理手感客观体检。
      </div>

      {circleReport && flickReport && (
        <section className="dashboard-grid">
          <div className="card">
            <div className="card-label">拟合圆心 / 轨迹半径</div>
            <div className="card-value">
              R={circleReport.radius} <span className="unit">px</span>
            </div>
            <div className="card-sub">圆心 ({circleReport.centerX}, {circleReport.centerY})</div>
          </div>

          <div className="card">
            <div className="card-label">高频径向微抖动 (RMS)</div>
            <div className={`card-value ${circleReport.highFreqJitterRmsPx > 1.5 ? 'highlight-alert' : 'highlight-emerald'}`}>
              ±{circleReport.highFreqJitterRmsPx} <span className="unit">px</span>
            </div>
            <div className="card-sub">顿挫锯齿点 {circleReport.stutterCount} 处 / 峰谷差 {circleReport.maxPeakToPeakPx}px</div>
          </div>

          <div className="card">
            <div className="card-label">急停过冲超调 (Overshoot)</div>
            <div className={`card-value ${flickReport.overshootPx > 10 ? 'highlight-alert' : 'highlight-emerald'}`}>
              {flickReport.overshootPx} <span className="unit">px</span> ({flickReport.overshootRatioPct}%)
            </div>
            <div className="card-sub">回拉稳定耗时 {flickReport.settleTimeMs} ms</div>
          </div>

          <div className="card">
            <div className="card-label">回报率 / 间隔波动</div>
            <div className="card-value highlight-amber">
              {pollingReport?.estimatedHz ?? 0} <span className="unit">Hz</span>
            </div>
            <div className="card-sub">Δt抖动 ±{pollingReport?.intervalJitterStdMs ?? 0}ms / 跳变 {pollingReport?.dropSpikeCount ?? 0}次</div>
          </div>
        </section>
      )}

      {/* 实验台切换与实时测试画布 */}
      <div className="stage-panel">
        <div className="stage-header">
          <div className="tab-group">
            <button className={`tab-btn ${activeTab === 'CIRCLE' ? 'active' : ''}`} onClick={() => setActiveTab('CIRCLE')}>
              实验一：匀速画圆（量化径向微抖动与顿挫）
            </button>
            <button className={`tab-btn ${activeTab === 'FLICK' ? 'active' : ''}`} onClick={() => setActiveTab('FLICK')}>
              实验二：两点甩枪急停（量化超调过冲与回拉）
            </button>
          </div>
          <span className="count-hint">在下方深色区域拖动鼠标实时实测</span>
        </div>

        <canvas
          className="trace-canvas"
          width={800}
          height={380}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div className="canvas-footer-hint">
          {userPoints.length === 0 ? '当前展示内置样本轨迹，按住左键直接画圆或拉直线开测' : `正在采集：已记录 ${userPoints.length} 个高精度时间戳轨迹点`}
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
