import { simulateProject } from "../../shared/domain/simulation";
import {
  isSimulationMode,
  type LatencyProject,
  type RequestNode,
  type ScenarioSnapshot,
  type SimulationMode,
  type SimulationResult,
} from "../../shared/domain/types";

export interface ScenarioComparison {
  deltaMs: number;
  changes: string[];
  outcome: "faster" | "slower" | "equal";
  /** 两侧快照各自的有效假设；旧快照缺字段时按当前假设解释。 */
  baselineMode: SimulationMode;
  comparisonMode: SimulationMode;
  /** 两侧有效假设不一致时为 true，原始完成预算不能直接比较。 */
  assumptionsDiffer: boolean;
  /** 该侧快照缺少假设记录，是按当前假设解释的旧数据。 */
  baselineAssumptionLegacy: boolean;
  comparisonAssumptionLegacy: boolean;
  /** 对比中某一侧是否已经按统一假设重新推演（视图层派生，快照本身不被改写）。 */
  baselineProjected: boolean;
  comparisonProjected: boolean;
}

function describeNodeChanges(
  before: RequestNode,
  after: RequestNode,
): string[] {
  const changes: string[] = [];
  if (before.durationMs !== after.durationMs)
    changes.push(
      `${before.name} · 耗时 ${before.durationMs} → ${after.durationMs} ms`,
    );
  if (before.jitterMs !== after.jitterMs)
    changes.push(
      `${before.name} · 波动 ±${before.jitterMs} → ±${after.jitterMs} ms`,
    );
  if (before.timeoutMs !== after.timeoutMs)
    changes.push(
      `${before.name} · 超时 ${before.timeoutMs} → ${after.timeoutMs} ms`,
    );
  if (before.retryCount !== after.retryCount)
    changes.push(
      `${before.name} · 重试 ${before.retryCount} → ${after.retryCount} 次`,
    );
  if (before.failureRate !== after.failureRate)
    changes.push(
      `${before.name} · 失败率 ${before.failureRate} → ${after.failureRate}%`,
    );
  if (before.fallbackNodeId !== after.fallbackNodeId)
    changes.push(`${before.name} · 降级目标已调整`);
  if (before.dependencyIds.join("|") !== after.dependencyIds.join("|"))
    changes.push(`${before.name} · 前置依赖已调整`);
  return changes;
}

/**
 * 旧版快照没有 assumptionMode 字段：不是损坏数据，
 * 按当前推演假设解释，并由调用方向用户说明。
 */
export function snapshotAssumptionMode(
  snapshot: ScenarioSnapshot,
  currentMode: SimulationMode,
): { mode: SimulationMode; legacy: boolean } {
  return isSimulationMode(snapshot.assumptionMode)
    ? { mode: snapshot.assumptionMode, legacy: false }
    : { mode: currentMode, legacy: true };
}

export function compareScenarios(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
  currentMode: SimulationMode = "expected",
  projection?: {
    baselineMode?: SimulationMode;
    comparisonMode?: SimulationMode;
  },
): ScenarioComparison {
  const baselineAssumption = snapshotAssumptionMode(baseline, currentMode);
  const comparisonAssumption = snapshotAssumptionMode(comparison, currentMode);
  const baselineMode = projection?.baselineMode ?? baselineAssumption.mode;
  const comparisonMode =
    projection?.comparisonMode ?? comparisonAssumption.mode;
  const baselineProjected = projection?.baselineMode !== undefined;
  const comparisonProjected = projection?.comparisonMode !== undefined;
  const assumptionsDiffer = baselineMode !== comparisonMode;

  const baselineNodes = new Map(baseline.nodes.map((node) => [node.id, node]));
  const comparisonNodes = new Map(
    comparison.nodes.map((node) => [node.id, node]),
  );
  const changes = [
    ...baseline.nodes.flatMap((node) => {
      const next = comparisonNodes.get(node.id);
      return next
        ? describeNodeChanges(node, next)
        : [`${node.name} · 已从对照方案移除`];
    }),
    ...comparison.nodes
      .filter((node) => !baselineNodes.has(node.id))
      .map((node) => `${node.name} · 新增请求节点`),
  ];
  if (baseline.concurrencyLimit !== comparison.concurrencyLimit)
    changes.unshift(
      `并发上限 · ${baseline.concurrencyLimit ?? "不限"} → ${comparison.concurrencyLimit ?? "不限"}`,
    );
  return {
    deltaMs: comparison.completionMs - baseline.completionMs,
    changes,
    outcome:
      comparison.completionMs < baseline.completionMs
        ? "faster"
        : comparison.completionMs > baseline.completionMs
          ? "slower"
          : "equal",
    baselineMode,
    comparisonMode,
    assumptionsDiffer,
    baselineAssumptionLegacy: baselineAssumption.legacy,
    comparisonAssumptionLegacy: comparisonAssumption.legacy,
    baselineProjected,
    comparisonProjected,
  };
}

export function saveScenario(
  project: LatencyProject,
  result: SimulationResult,
  name: string,
): LatencyProject {
  if (
    result.warnings.some(
      (warning) => warning.includes("检测到循环") || warning.includes("不能"),
    )
  )
    return project;
  const snapshot: ScenarioSnapshot = {
    id: crypto.randomUUID(),
    name: name.trim() || `方案 ${project.scenarios.length + 1}`,
    createdAt: Date.now(),
    concurrencyLimit: project.concurrencyLimit,
    nodes: structuredClone(project.nodes),
    completionMs: result.completionMs,
    criticalPath: [...result.criticalPath],
    assumptionMode: result.mode,
  };
  return {
    ...project,
    scenarios: [snapshot, ...project.scenarios],
    updatedAt: Date.now(),
  };
}

export function removeScenario(
  project: LatencyProject,
  scenarioId: string,
): LatencyProject {
  return {
    ...project,
    scenarios: project.scenarios.filter(
      (scenario) => scenario.id !== scenarioId,
    ),
    updatedAt: Date.now(),
  };
}

/** 恢复旧方案时，快照保存时使用的假设一起返回；旧快照返回当前假设。 */
export function restoreScenarioAssumption(
  project: LatencyProject,
  scenarioId: string,
  currentMode: SimulationMode,
): SimulationMode | undefined {
  const snapshot = project.scenarios.find(
    (scenario) => scenario.id === scenarioId,
  );
  if (!snapshot) return undefined;
  return snapshotAssumptionMode(snapshot, currentMode).mode;
}

export function restoreScenario(
  project: LatencyProject,
  scenarioId: string,
): LatencyProject {
  const snapshot = project.scenarios.find(
    (scenario) => scenario.id === scenarioId,
  );
  if (!snapshot) return project;
  return {
    ...project,
    nodes: structuredClone(snapshot.nodes),
    concurrencyLimit: snapshot.concurrencyLimit,
    updatedAt: Date.now(),
  };
}

/**
 * 按指定假设对快照里保存的图重新推演，得到只用于本次对比的派生快照。
 * 原始快照保持不变；快照本身没有有效推演结果（如循环）时原样返回。
 */
export function projectScenario(
  snapshot: ScenarioSnapshot,
  mode: SimulationMode,
): ScenarioSnapshot {
  const result = simulateProject(
    {
      id: `projection-${snapshot.id}`,
      title: snapshot.name,
      nodes: structuredClone(snapshot.nodes),
      concurrencyLimit: snapshot.concurrencyLimit,
      scenarios: [],
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.createdAt,
    },
    mode,
  );
  if (result.entries.length !== snapshot.nodes.length) return snapshot;
  return {
    ...snapshot,
    completionMs: result.completionMs,
    criticalPath: [...result.criticalPath],
  };
}
