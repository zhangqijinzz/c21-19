export interface RequestNode {
  id: string;
  name: string;
  durationMs: number;
  jitterMs: number;
  dependencyIds: string[];
  timeoutMs: number;
  retryCount: number;
  failureRate: number;
  fallbackNodeId?: string;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: number;
  concurrencyLimit: number | null;
  nodes: RequestNode[];
  completionMs: number;
  criticalPath: string[];
  /** 本次保存时使用的波动假设；旧版快照没有该字段，按当前假设解释。 */
  assumptionMode?: SimulationMode;
}

export interface LatencyProject {
  id: string;
  title: string;
  nodes: RequestNode[];
  concurrencyLimit: number | null;
  scenarios: ScenarioSnapshot[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceDocument {
  version: 1;
  activeProjectId: string;
  projects: LatencyProject[];
}

export type SimulationMode = "low" | "expected" | "high";

export const SIMULATION_MODES: {
  id: SimulationMode;
  label: string;
  sub: string;
  situation: string;
}[] = [
  { id: "low", label: "乐观", sub: "低波动", situation: "乐观情境" },
  { id: "expected", label: "预期", sub: "中位估算", situation: "预期情境" },
  { id: "high", label: "保守", sub: "高波动", situation: "保守情境" },
];

export function isSimulationMode(value: unknown): value is SimulationMode {
  return value === "low" || value === "expected" || value === "high";
}

export function modeLabel(mode: SimulationMode): string {
  return SIMULATION_MODES.find((item) => item.id === mode)?.label ?? mode;
}

export interface TimelineEntry {
  nodeId: string;
  startMs: number;
  endMs: number;
  modeledDurationMs: number;
  waitMs: number;
  criticalPredecessorId?: string;
}

export interface SimulationResult {
  mode: SimulationMode;
  completionMs: number;
  criticalPath: string[];
  entries: TimelineEntry[];
  warnings: string[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export const EXAMPLE_PROJECT: LatencyProject = {
  id: "project-latency-demo",
  title: "商品详情页 · 首屏预算",
  concurrencyLimit: null,
  createdAt: 1_728_000_000_000,
  updatedAt: 1_728_000_000_000,
  scenarios: [],
  nodes: [
    {
      id: "session",
      name: "会话校验",
      durationMs: 280,
      jitterMs: 80,
      dependencyIds: [],
      timeoutMs: 800,
      retryCount: 1,
      failureRate: 1,
    },
    {
      id: "flags",
      name: "功能开关",
      durationMs: 210,
      jitterMs: 50,
      dependencyIds: [],
      timeoutMs: 700,
      retryCount: 0,
      failureRate: 0,
    },
    {
      id: "profile",
      name: "用户资料",
      durationMs: 460,
      jitterMs: 120,
      dependencyIds: ["session"],
      timeoutMs: 1200,
      retryCount: 1,
      failureRate: 3,
    },
    {
      id: "catalog",
      name: "商品目录",
      durationMs: 740,
      jitterMs: 180,
      dependencyIds: ["session"],
      timeoutMs: 1400,
      retryCount: 1,
      failureRate: 2,
    },
    {
      id: "recommend",
      name: "个性推荐",
      durationMs: 520,
      jitterMs: 220,
      dependencyIds: ["flags", "profile"],
      timeoutMs: 1500,
      retryCount: 1,
      failureRate: 5,
      fallbackNodeId: "catalog",
    },
  ],
};

export function createEmptyProject(now = Date.now()): LatencyProject {
  return {
    id: `project-${crypto.randomUUID()}`,
    title: "未命名链路",
    nodes: [],
    concurrencyLimit: null,
    scenarios: [],
    createdAt: now,
    updatedAt: now,
  };
}
