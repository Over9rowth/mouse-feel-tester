export interface Point2D {
  x: number;
  y: number;
}

export interface TimedPoint extends Point2D {
  t: number;
}

export interface FitCircleResult {
  centerX: number;
  centerY: number;
  radius: number;
}

export interface CircleTraceAnalysis extends FitCircleResult {
  radialRmsPx: number;
  highFreqJitterRmsPx: number;
  maxPeakToPeakPx: number;
  stutterCount: number;
  stutterAnglesDeg: number[];
  smoothnessScore: number;
}

export interface FlickLineAnalysis {
  targetDistancePx: number;
  lateralDeviationRmsPx: number;
  maxProjectionPx: number;
  overshootPx: number;
  overshootRatioPct: number;
  settleTimeMs: number;
}

export interface PollingStabilityAnalysis {
  sampleCount: number;
  meanIntervalMs: number;
  estimatedHz: number;
  intervalJitterStdMs: number;
  dropSpikeCount: number;
}

export declare function fitLeastSquaresCircle(points: Point2D[]): FitCircleResult;
export declare function analyzeCircleTrace(points: TimedPoint[]): CircleTraceAnalysis;
export declare function analyzeFlickLine(points: TimedPoint[], startTarget: Point2D, endTarget: Point2D): FlickLineAnalysis;
export declare function analyzePollingStability(points: TimedPoint[]): PollingStabilityAnalysis;
