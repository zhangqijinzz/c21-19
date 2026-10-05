import { describe, expect, it } from "vitest";
import {
  createProject,
  duplicateProject,
  selectProject,
} from "../src/features/projects/projectViewModel";
import {
  compareScenarios,
  projectScenario,
  restoreScenario,
  restoreScenarioAssumption,
  saveScenario,
  snapshotAssumptionMode,
} from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";
import { EXAMPLE_PROJECT } from "../src/shared/domain/types";

describe("project and scenario view models", () => {
  it("creates a project and switches the active project", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const created = createProject(initial, 100);
    expect(created.projects).toHaveLength(2);
    expect(created.activeProjectId).not.toBe(EXAMPLE_PROJECT.id);
    expect(selectProject(created, EXAMPLE_PROJECT.id).activeProjectId).toBe(
      EXAMPLE_PROJECT.id,
    );
  });

  it("duplicates a project and remaps its dependency identities", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const duplicated = duplicateProject(initial, EXAMPLE_PROJECT, 10);
    const copy = duplicated.projects[0];
    expect(copy?.nodes[2]?.dependencyIds).toEqual([copy?.nodes[0]?.id]);
    expect(copy?.nodes[4]?.fallbackNodeId).toBe(copy?.nodes[3]?.id);
    expect(copy?.id).not.toBe(EXAMPLE_PROJECT.id);
    expect(copy?.scenarios).toEqual([]);
  });

  it("saves a complete snapshot and restores its parameters", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const result = simulateProject(baseline);
    const saved = saveScenario(baseline, result, "并发方案");
    expect(saved.scenarios).toHaveLength(1);
    const changed = {
      ...saved,
      nodes: saved.nodes.map((node) => ({ ...node, durationMs: 999 })),
    };
    const restored = restoreScenario(changed, saved.scenarios[0]?.id ?? "");
    expect(restored.nodes[0]?.durationMs).toBe(baseline.nodes[0]?.durationMs);
  });

  it("describes node and concurrency differences between snapshots", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const baselineSnapshot = saveScenario(
      baseline,
      simulateProject(baseline),
      "不限并发",
    ).scenarios[0];
    const changed = {
      ...baseline,
      concurrencyLimit: 1,
      nodes: baseline.nodes.map((node, index) =>
        index === 0 ? { ...node, durationMs: 900 } : node,
      ),
    };
    const changedSnapshot = saveScenario(
      changed,
      simulateProject(changed),
      "串行优化",
    ).scenarios[0];
    if (!baselineSnapshot || !changedSnapshot)
      throw new Error("Scenario fixtures should be saved");
    const comparison = compareScenarios(baselineSnapshot, changedSnapshot);
    expect(comparison.deltaMs).toBeGreaterThan(0);
    expect(comparison.changes.join(" ")).toContain("并发上限");
    expect(comparison.changes.join(" ")).toContain("耗时");
  });

  it("records the simulation assumption on a saved snapshot", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const saved = saveScenario(
      project,
      simulateProject(project, "high"),
      "保守版",
    );
    expect(saved.scenarios[0]?.assumptionMode).toBe("high");
  });

  it("flags differing assumptions when comparing snapshots", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const optimistic = saveScenario(
      project,
      simulateProject(project, "low"),
      "乐观",
    ).scenarios[0]!;
    const conservative = saveScenario(
      project,
      simulateProject(project, "high"),
      "保守",
    ).scenarios[0]!;
    const comparison = compareScenarios(optimistic, conservative, "expected");
    expect(comparison.assumptionsDiffer).toBe(true);
    expect(comparison.baselineMode).toBe("low");
    expect(comparison.comparisonMode).toBe("high");
    expect(comparison.deltaMs).toBeGreaterThan(0);
  });

  it("re-runs one side under a unified assumption without mutating the snapshot", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const optimistic = saveScenario(
      project,
      simulateProject(project, "low"),
      "乐观",
    ).scenarios[0]!;
    const conservative = saveScenario(
      project,
      simulateProject(project, "high"),
      "保守",
    ).scenarios[0]!;
    const reprojected = projectScenario(optimistic, "high");
    const comparison = compareScenarios(reprojected, conservative, "expected", {
      baselineMode: "high",
    });
    expect(comparison.assumptionsDiffer).toBe(false);
    expect(comparison.baselineProjected).toBe(true);
    expect(comparison.deltaMs).toBe(0);
    // 原快照保存时的假设与完成预算都不应被改写。
    expect(optimistic.assumptionMode).toBe("low");
    expect(optimistic.completionMs).not.toBe(reprojected.completionMs);
  });

  it("treats snapshots without an assumption field as legacy, using the current assumption", () => {
    const legacy: ReturnType<typeof saveScenario>["scenarios"][number] = {
      id: "legacy",
      name: "旧方案",
      createdAt: 1000,
      concurrencyLimit: null,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
      completionMs: 500,
      criticalPath: [],
    };
    expect(snapshotAssumptionMode(legacy, "high")).toEqual({
      mode: "high",
      legacy: true,
    });
    const modern = saveScenario(
      { ...EXAMPLE_PROJECT, nodes: EXAMPLE_PROJECT.nodes.slice(0, 2) },
      simulateProject(
        { ...EXAMPLE_PROJECT, nodes: EXAMPLE_PROJECT.nodes.slice(0, 2) },
        "low",
      ),
      "新版",
    ).scenarios[0]!;
    const comparison = compareScenarios(legacy, modern, "high");
    expect(comparison.baselineAssumptionLegacy).toBe(true);
    expect(comparison.comparisonAssumptionLegacy).toBe(false);
    expect(comparison.assumptionsDiffer).toBe(true);
  });

  it("restores a snapshot together with its saved assumption", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const saved = saveScenario(
      project,
      simulateProject(project, "low"),
      "乐观",
    );
    const restoredMode = restoreScenarioAssumption(
      saved,
      saved.scenarios[0]!.id,
      "high",
    );
    expect(restoredMode).toBe("low");
  });

  it("keeps the current assumption when restoring a legacy snapshot", () => {
    const legacyProject: typeof EXAMPLE_PROJECT = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
      scenarios: [
        {
          id: "legacy",
          name: "旧方案",
          createdAt: 1000,
          concurrencyLimit: null,
          nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
          completionMs: 500,
          criticalPath: [],
        },
      ],
    };
    expect(restoreScenarioAssumption(legacyProject, "legacy", "high")).toBe(
      "high",
    );
  });
});
