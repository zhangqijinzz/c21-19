import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectRepository } from "../../shared/repositories/projectRepository";
import type {
  LatencyProject,
  SimulationMode,
  WorkspaceDocument,
} from "../../shared/domain/types";
import {
  createProject,
  duplicateProject,
  renameProject,
  selectProject,
} from "../projects/projectViewModel";
import {
  addRequestNode,
  patchRequestNode,
  removeRequestNode,
  setConcurrency,
  toggleDependency,
  getGraphAnalysis,
} from "../graph-editor/graphViewModel";
import {
  compareScenarios,
  projectScenario,
  removeScenario,
  restoreScenario,
  restoreScenarioAssumption,
  saveScenario,
  type ScenarioComparison,
} from "../scenarios/scenarioViewModel";
import { removeProject, updateProject } from "../projects/projectViewModel";
import { simulateProject } from "../../shared/domain/simulation";

export type LabStatus =
  "loading" | "ready" | "editing" | "simulating" | "error" | "completed";
export type LabModule =
  "projects" | "graph" | "simulation" | "scenarios" | "archive";

export function useLatencyLab() {
  const repository = useMemo(() => new ProjectRepository(), []);
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const documentRef = useRef<WorkspaceDocument | null>(null);
  const [status, setStatus] = useState<LabStatus>("loading");
  const [module, setModule] = useState<LabModule>("simulation");
  const [mode, setMode] = useState<SimulationMode>("expected");
  const [comparisonIds, setComparisonIds] = useState<{
    baselineId: string;
    comparisonId: string;
  }>({ baselineId: "", comparisonId: "" });
  // 两侧按统一假设重新推演的结果只用于本次对比，不写回已保存快照。
  const [projection, setProjection] = useState<{
    baselineMode?: SimulationMode;
    comparisonMode?: SimulationMode;
  }>({});
  // 用户选择的统一假设；未选择时取基准侧的有效假设。
  const [unifiedModeOverride, setUnifiedModeOverride] =
    useState<SimulationMode | null>(null);
  // 恢复旧方案后 mode state 要等下一次渲染才生效，保存路径需读到最新假设。
  const modeRef = useRef(mode);
  const applyMode = useCallback((nextMode: SimulationMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);
  const [notice, setNotice] = useState("");
  const [persisted, setPersisted] = useState<"saving" | "saved" | "error">(
    "saved",
  );
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const activeProject =
    document?.projects.find(
      (project) => project.id === document.activeProjectId,
    ) ?? document?.projects[0];
  const result = useMemo(
    () => (activeProject ? simulateProject(activeProject, mode) : undefined),
    [activeProject, mode],
  );
  const graphAnalysis = useMemo(
    () => (activeProject ? getGraphAnalysis(activeProject) : undefined),
    [activeProject],
  );
  const scenarioList = activeProject?.scenarios ?? [];
  const rawBaselineScenario =
    scenarioList.find((scenario) => scenario.id === comparisonIds.baselineId) ??
    scenarioList[1] ??
    scenarioList[0];
  const rawComparisonScenario =
    scenarioList.find(
      (scenario) => scenario.id === comparisonIds.comparisonId,
    ) ?? scenarioList[0];
  const baselineScenario = rawBaselineScenario
    ? projection.baselineMode
      ? projectScenario(rawBaselineScenario, projection.baselineMode)
      : rawBaselineScenario
    : undefined;
  const comparisonScenario = rawComparisonScenario
    ? projection.comparisonMode
      ? projectScenario(rawComparisonScenario, projection.comparisonMode)
      : rawComparisonScenario
    : undefined;
  const scenarioComparison: ScenarioComparison | undefined =
    rawBaselineScenario &&
    rawComparisonScenario &&
    baselineScenario &&
    comparisonScenario
      ? compareScenarios(baselineScenario, comparisonScenario, mode, {
          ...(projection.baselineMode
            ? { baselineMode: projection.baselineMode }
            : {}),
          ...(projection.comparisonMode
            ? { comparisonMode: projection.comparisonMode }
            : {}),
        })
      : undefined;
  const unifiedMode =
    unifiedModeOverride ?? scenarioComparison?.baselineMode ?? mode;
  const simulationValid =
    Boolean(activeProject) &&
    result?.entries.length === activeProject?.nodes.length;

  const activeProjectId = activeProject?.id;
  const previousProjectIdRef = useRef(activeProjectId);
  useEffect(() => {
    if (activeProjectId && previousProjectIdRef.current !== activeProjectId) {
      previousProjectIdRef.current = activeProjectId;
      setComparisonIds({ baselineId: "", comparisonId: "" });
      setProjection({});
      setUnifiedModeOverride(null);
    }
  }, [activeProjectId]);

  const selectComparisonScenario = useCallback(
    (side: "baselineId" | "comparisonId", id: string) => {
      setComparisonIds((current) => ({ ...current, [side]: id }));
      // 换了快照后，上一侧派生出的重新推演结果不再适用。
      setProjection({});
      setUnifiedModeOverride(null);
    },
    [],
  );

  const projectComparisonSide = useCallback(
    (side: "baseline" | "comparison", nextMode: SimulationMode) => {
      setProjection((current) => ({
        ...current,
        [side === "baseline" ? "baselineMode" : "comparisonMode"]: nextMode,
      }));
      setUnifiedModeOverride(nextMode);
    },
    [],
  );

  const alignBothSides = useCallback((nextMode: SimulationMode) => {
    setProjection({ baselineMode: nextMode, comparisonMode: nextMode });
    setUnifiedModeOverride(nextMode);
  }, []);

  const clearProjection = useCallback(() => {
    setProjection({});
    setUnifiedModeOverride(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    void repository
      .load()
      .then(({ document: loaded, recovered }) => {
        if (!mounted) return;
        documentRef.current = loaded;
        setDocument(loaded);
        setStatus("ready");
        if (recovered)
          setNotice("已载入示例工作区；后续修改会自动保存到此设备。");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
        setNotice("本地项目读取失败，刷新页面可再次尝试。");
      });
    return () => {
      mounted = false;
    };
  }, [repository]);

  const commit = useCallback(
    (next: WorkspaceDocument, nextStatus: LabStatus = "editing") => {
      const currentRevision = ++revision.current;
      documentRef.current = next;
      setDocument(next);
      setStatus(nextStatus);
      setNotice("");
      setPersisted("saving");
      queue.current = queue.current
        .then(() => repository.save(next))
        .then(() => {
          if (revision.current === currentRevision) {
            setPersisted("saved");
            if (nextStatus === "editing") setStatus("completed");
          }
        })
        .catch(() => {
          if (revision.current === currentRevision) {
            setPersisted("error");
            setStatus("error");
            setNotice("保存失败。数据仍保留在当前页面，请重试保存。");
          }
        });
    },
    [repository],
  );

  const editProject = useCallback(
    (project: LatencyProject) => {
      const current = documentRef.current;
      if (current) commit(updateProject(current, project));
    },
    [commit],
  );

  const chooseProject = useCallback(
    (id: string) => {
      const current = documentRef.current;
      if (current) commit(selectProject(current, id), "ready");
    },
    [commit],
  );

  const newProject = useCallback(() => {
    const current = documentRef.current;
    if (current) commit(createProject(current), "editing");
  }, [commit]);

  const renameActive = useCallback(
    (title: string) => {
      if (activeProject) editProject(renameProject(activeProject, title));
    },
    [activeProject, editProject],
  );

  const duplicateActive = useCallback(() => {
    const current = documentRef.current;
    if (current && activeProject)
      commit(duplicateProject(current, activeProject), "editing");
  }, [activeProject, commit]);

  const deleteProject = useCallback(
    (id: string) => {
      const current = documentRef.current;
      if (current && current.projects.length > 1)
        commit(removeProject(current, id), "editing");
      else setNotice("至少保留一个链路项目。");
    },
    [commit],
  );

  const addNode = useCallback(() => {
    if (activeProject) editProject(addRequestNode(activeProject));
  }, [activeProject, editProject]);
  const patchNode = useCallback(
    (id: string, patch: Parameters<typeof patchRequestNode>[2]) => {
      if (activeProject)
        editProject(patchRequestNode(activeProject, id, patch));
    },
    [activeProject, editProject],
  );
  const deleteNode = useCallback(
    (id: string) => {
      if (activeProject) editProject(removeRequestNode(activeProject, id));
    },
    [activeProject, editProject],
  );
  const setNodeDependency = useCallback(
    (id: string, dependencyId: string) => {
      if (!activeProject) return;
      const outcome = toggleDependency(activeProject, id, dependencyId);
      if (outcome.error) setNotice(outcome.error);
      else editProject(outcome.project);
    },
    [activeProject, editProject],
  );
  const setLimit = useCallback(
    (limit: number | null) => {
      if (activeProject) editProject(setConcurrency(activeProject, limit));
    },
    [activeProject, editProject],
  );

  const simulate = useCallback(
    (nextMode = modeRef.current) => {
      if (!activeProject) return undefined;
      setStatus("simulating");
      const result = simulateProject(activeProject, nextMode);
      applyMode(nextMode);
      setStatus(
        result.warnings.some((warning) => warning.includes("循环"))
          ? "error"
          : "completed",
      );
      return result;
    },
    [activeProject, applyMode],
  );

  const saveSnapshot = useCallback(
    (name: string): boolean => {
      if (!activeProject) return false;
      const currentMode = modeRef.current;
      const result = simulateProject(activeProject, currentMode);
      if (result.entries.length !== activeProject.nodes.length) {
        setNotice(result.warnings[0] ?? "请先修复链路配置再保存方案。");
        return false;
      }
      const next = saveScenario(activeProject, result, name);
      editProject(next);
      setComparisonIds({
        baselineId: next.scenarios[1]?.id ?? next.scenarios[0]?.id ?? "",
        comparisonId: next.scenarios[0]?.id ?? "",
      });
      setProjection({});
      setUnifiedModeOverride(null);
      setNotice("方案快照已保存。");
      return true;
    },
    [activeProject, editProject],
  );

  const removeSavedScenario = useCallback(
    (id: string) => {
      if (activeProject) editProject(removeScenario(activeProject, id));
    },
    [activeProject, editProject],
  );
  const restoreSavedScenario = useCallback(
    (id: string) => {
      if (!activeProject) return;
      // 把保存时使用的假设一起带回；旧快照没有记录，沿用当前假设。
      const restoredMode = restoreScenarioAssumption(
        activeProject,
        id,
        modeRef.current,
      );
      editProject(restoreScenario(activeProject, id));
      if (restoredMode) {
        applyMode(restoredMode);
        setProjection({});
        setUnifiedModeOverride(null);
      }
    },
    [activeProject, editProject, applyMode],
  );

  const retrySave = useCallback(() => {
    const current = documentRef.current;
    if (current) commit(current);
  }, [commit]);

  return {
    document,
    activeProject,
    result,
    graphAnalysis,
    simulationValid,
    status,
    module,
    setModule,
    mode,
    setMode: applyMode,
    notice,
    setNotice,
    persisted,
    chooseProject,
    newProject,
    renameActive,
    duplicateActive,
    deleteProject,
    addNode,
    patchNode,
    deleteNode,
    setNodeDependency,
    setLimit,
    simulate,
    saveSnapshot,
    removeSavedScenario,
    restoreSavedScenario,
    retrySave,
    scenarioList,
    baselineScenario,
    comparisonScenario,
    scenarioComparison,
    selectComparisonScenario,
    unifiedMode,
    chooseUnifiedMode: setUnifiedModeOverride,
    projectComparisonSide,
    alignBothSides,
    clearProjection,
  };
}
