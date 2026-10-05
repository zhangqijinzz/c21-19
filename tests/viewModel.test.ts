import { describe, expect, it } from "vitest";
import {
  createProject,
  duplicateProject,
  selectProject,
} from "../src/features/projects/projectViewModel";
import {
  compareScenarios,
  restoreScenario,
  saveScenario,
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
    expect(saved.scenarios[0]?.assumptionMode).toBe(result.mode);
    const changed = {
      ...saved,
      nodes: saved.nodes.map((node) => ({ ...node, durationMs: 999 })),
    };
    const restored = restoreScenario(
      changed,
      saved.scenarios[0]?.id ?? "",
      "high",
    );
    expect(restored.project.nodes[0]?.durationMs).toBe(
      baseline.nodes[0]?.durationMs,
    );
    expect(restored.mode).toBe(result.mode);
    expect(restored.legacy).toBe(false);
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
    const comparison = compareScenarios(baselineSnapshot, changedSnapshot, {
      currentMode: "expected",
    });
    expect(comparison.deltaMs).toBeGreaterThan(0);
    expect(comparison.changes.join(" ")).toContain("并发上限");
    expect(comparison.changes.join(" ")).toContain("耗时");
  });

  it("records the assumption used by the simulation in each snapshot", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const optimistic = saveScenario(
      baseline,
      simulateProject(baseline, "low"),
      "乐观快照",
    ).scenarios[0];
    const conservative = saveScenario(
      baseline,
      simulateProject(baseline, "high"),
      "保守快照",
    ).scenarios[0];
    if (!optimistic || !conservative)
      throw new Error("Scenario fixtures should be saved");
    expect(optimistic.assumptionMode).toBe("low");
    expect(conservative.assumptionMode).toBe("high");
    expect(optimistic.completionMs).toBeLessThan(conservative.completionMs);

    const mixed = compareScenarios(optimistic, conservative, {
      currentMode: "expected",
    });
    expect(mixed.assumptionsDiffer).toBe(true);
    expect(mixed.unified).toBe(false);
    expect(mixed.notices.join(" ")).toContain("假设不同");
    // 原始完成时间差包含假设差异
    const rawDelta = mixed.deltaMs;

    // 按基准的乐观假设重推演对照侧后，参数完全相同，差异归零
    const unified = compareScenarios(optimistic, conservative, {
      currentMode: "expected",
      comparisonMode: "low",
    });
    expect(unified.assumptionsDiffer).toBe(false);
    expect(unified.unified).toBe(true);
    expect(unified.comparisonSide.replayed).toBe(true);
    expect(unified.comparisonSide.completionMs).toBe(optimistic.completionMs);
    expect(unified.deltaMs).toBe(0);
    expect(rawDelta).toBeGreaterThan(0);

    // 按对照的保守假设重推演基准侧
    const unifiedHigh = compareScenarios(optimistic, conservative, {
      currentMode: "expected",
      baselineMode: "high",
    });
    expect(unifiedHigh.baselineSide.completionMs).toBe(
      conservative.completionMs,
    );
    expect(unifiedHigh.deltaMs).toBe(0);
  });

  it("treats snapshots without an assumption field as using the current mode", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const result = simulateProject(baseline, "expected");
    const saved = saveScenario(baseline, result, "旧格式快照");
    const legacySnapshot = saved.scenarios[0];
    if (!legacySnapshot) throw new Error("Scenario fixture should be saved");
    delete legacySnapshot.assumptionMode;

    // 当前假设为乐观：旧快照按乐观重算，与乐观新快照假设一致
    const optimistic = {
      ...legacySnapshot,
      id: "optimistic",
      assumptionMode: "low" as const,
      completionMs: simulateProject(baseline, "low").completionMs,
    };
    const asLow = compareScenarios(legacySnapshot, optimistic, {
      currentMode: "low",
    });
    expect(asLow.baselineSide.legacy).toBe(true);
    expect(asLow.assumptionsDiffer).toBe(false);
    expect(asLow.unified).toBe(false);
    expect(asLow.baselineSide.replayed).toBe(true);
    expect(asLow.baselineSide.completionMs).toBe(
      simulateProject(baseline, "low").completionMs,
    );
    expect(asLow.deltaMs).toBe(0);
    expect(asLow.notices.join(" ")).toContain("未记录假设");

    // 当前假设为保守：同一份旧快照按保守重算，与乐观新快照假设不同
    const asHigh = compareScenarios(legacySnapshot, optimistic, {
      currentMode: "high",
    });
    expect(asHigh.assumptionsDiffer).toBe(true);
    expect(asHigh.baselineSide.completionMs).toBe(
      simulateProject(baseline, "high").completionMs,
    );

    // 恢复旧快照时不带回假设，沿用当前假设
    const restored = restoreScenario(saved, legacySnapshot.id, "high");
    expect(restored.mode).toBe("high");
    expect(restored.legacy).toBe(true);
  });

  it("brings the saved assumption back when restoring a modern snapshot", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const saved = saveScenario(
      baseline,
      simulateProject(baseline, "high"),
      "保守方案",
    );
    const restored = restoreScenario(saved, saved.scenarios[0]!.id, "low");
    expect(restored.mode).toBe("high");
    expect(restored.legacy).toBe(false);
  });
});
