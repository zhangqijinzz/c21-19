import { simulateProject } from "../../shared/domain/simulation";
import {
  SIMULATION_MODE_LABELS,
  isSimulationMode,
  type LatencyProject,
  type RequestNode,
  type ScenarioSnapshot,
  type SimulationMode,
  type SimulationResult,
} from "../../shared/domain/types";

export interface ScenarioSide {
  mode: SimulationMode;
  completionMs: number;
  criticalPath: string[];
  legacy: boolean;
  replayed: boolean;
}

export interface ScenarioComparison {
  baselineSide: ScenarioSide;
  comparisonSide: ScenarioSide;
  deltaMs: number;
  changes: string[];
  outcome: "faster" | "slower" | "equal";
  assumptionsDiffer: boolean;
  unified: boolean;
  notices: string[];
}

export interface CompareScenarioOptions {
  currentMode: SimulationMode;
  baselineMode?: SimulationMode;
  comparisonMode?: SimulationMode;
}

/**
 * 解析一侧快照在给定假设下的展示值。
 * 旧快照没有记录假设档位，按当前假设处理：展示值需要按当前假设重新推演，
 * 因为保存的完成时间是旧版本按其默认假设计算的。
 */
export function getSnapshotSide(
  snapshot: ScenarioSnapshot,
  currentMode: SimulationMode,
  overrideMode?: SimulationMode,
): ScenarioSide {
  return resolveSide(snapshot, currentMode, overrideMode);
}

function resolveSide(
  snapshot: ScenarioSnapshot,
  currentMode: SimulationMode,
  overrideMode: SimulationMode | undefined,
): ScenarioSide {
  const legacy = !isSimulationMode(snapshot.assumptionMode);
  const recordedMode = isSimulationMode(snapshot.assumptionMode)
    ? snapshot.assumptionMode
    : undefined;
  const mode = overrideMode ?? recordedMode ?? currentMode;
  // 新快照在自身假设下用保存值；统一重推演、或旧快照按当前假设处理时都重新计算。
  const replayed = mode !== recordedMode;
  if (!replayed) {
    return {
      mode,
      completionMs: snapshot.completionMs,
      criticalPath: snapshot.criticalPath,
      legacy,
      replayed,
    };
  }
  const replay = simulateProject(
    {
      id: snapshot.id,
      title: snapshot.name,
      nodes: snapshot.nodes,
      concurrencyLimit: snapshot.concurrencyLimit,
      scenarios: [],
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.createdAt,
    },
    mode,
  );
  // 快照里的图理论上总是无环的；若重推演失败（例如数据被外部改写），保留原值并提示。
  if (replay.entries.length !== snapshot.nodes.length) {
    return {
      mode,
      completionMs: snapshot.completionMs,
      criticalPath: snapshot.criticalPath,
      legacy,
      replayed: false,
    };
  }
  return {
    mode,
    completionMs: replay.completionMs,
    criticalPath: replay.criticalPath,
    legacy,
    replayed,
  };
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

export function compareScenarios(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
  options: CompareScenarioOptions = { currentMode: "expected" },
): ScenarioComparison {
  const { currentMode } = options;
  const baselineSide = resolveSide(baseline, currentMode, options.baselineMode);
  const comparisonSide = resolveSide(
    comparison,
    currentMode,
    options.comparisonMode,
  );

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

  const assumptionsDiffer = baselineSide.mode !== comparisonSide.mode;
  const explicitReplay =
    options.baselineMode !== undefined || options.comparisonMode !== undefined;
  const unified = !assumptionsDiffer && explicitReplay;
  const replayFailed =
    (options.baselineMode !== undefined && !baselineSide.replayed) ||
    (options.comparisonMode !== undefined && !comparisonSide.replayed);

  const notices: string[] = [];
  const modeText = (side: ScenarioSide, snapshot: ScenarioSnapshot) => {
    const label = SIMULATION_MODE_LABELS[side.mode];
    return side.legacy
      ? `${snapshot.name} · 未记录假设，已按当前「${label}」情境重新推演`
      : `${snapshot.name} · 保存时使用「${label}」情境`;
  };
  if (baselineSide.legacy) notices.push(modeText(baselineSide, baseline));
  if (comparisonSide.legacy && comparison.id !== baseline.id)
    notices.push(modeText(comparisonSide, comparison));
  if (assumptionsDiffer)
    notices.push(
      `两侧假设不同：基准为「${SIMULATION_MODE_LABELS[baselineSide.mode]}」，对照为「${SIMULATION_MODE_LABELS[comparisonSide.mode]}」，当前时间差包含假设差异，不只是参数变化。`,
    );
  if (unified)
    notices.push(
      `已按统一「${SIMULATION_MODE_LABELS[baselineSide.mode]}」假设重新推演，时间差仅反映参数差异，不会改动已保存快照。`,
    );
  if (replayFailed)
    notices.push(
      "一侧快照无法按该假设重新推演（链路配置异常），仍显示保存时的数值。",
    );

  return {
    baselineSide,
    comparisonSide,
    deltaMs: comparisonSide.completionMs - baselineSide.completionMs,
    changes,
    outcome:
      comparisonSide.completionMs < baselineSide.completionMs
        ? "faster"
        : comparisonSide.completionMs > baselineSide.completionMs
          ? "slower"
          : "equal",
    assumptionsDiffer,
    unified,
    notices,
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

export interface RestoredScenario {
  project: LatencyProject;
  mode: SimulationMode;
  legacy: boolean;
}

export function restoreScenario(
  project: LatencyProject,
  scenarioId: string,
  currentMode: SimulationMode,
): RestoredScenario {
  const snapshot = project.scenarios.find(
    (scenario) => scenario.id === scenarioId,
  );
  if (!snapshot) return { project, mode: currentMode, legacy: false };
  const legacy = !isSimulationMode(snapshot.assumptionMode);
  return {
    project: {
      ...project,
      nodes: structuredClone(snapshot.nodes),
      concurrencyLimit: snapshot.concurrencyLimit,
      updatedAt: Date.now(),
    },
    mode: legacy ? currentMode : (snapshot.assumptionMode as SimulationMode),
    legacy,
  };
}
