import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  GitCompareArrows,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  modeLabel,
  SIMULATION_MODES,
  type LatencyProject,
  type ScenarioSnapshot,
  type SimulationMode,
} from "../../shared/domain/types";
import type { ScenarioComparison } from "./scenarioViewModel";

interface Props {
  project: LatencyProject;
  currentMode: SimulationMode;
  onSave: (name: string) => boolean;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
  baseline?: ScenarioSnapshot;
  comparison?: ScenarioSnapshot;
  comparisonResult?: ScenarioComparison;
  onSelectBaseline: (id: string) => void;
  onSelectComparison: (id: string) => void;
  unifiedMode: SimulationMode;
  onChooseUnifiedMode: (mode: SimulationMode) => void;
  onProjectSide: (
    side: "baseline" | "comparison",
    mode: SimulationMode,
  ) => void;
  onAlignBoth: (mode: SimulationMode) => void;
  onClearProjection: () => void;
}

function formatDuration(value: number): string {
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;
}

function AssumptionTag({
  mode,
  projected,
  legacy,
  currentMode,
}: {
  mode: SimulationMode;
  projected?: boolean;
  legacy?: boolean;
  currentMode: SimulationMode;
}) {
  return (
    <em className="assumption-tag">
      {projected ? "已按统一假设重算 · " : "假设 · "}
      {modeLabel(mode)}
      {legacy && !projected && (
        <small
          title={`旧版快照未记录假设，按当前假设（${modeLabel(currentMode)}）解释`}
        >
          {" "}
          · 旧快照按当前假设解释
        </small>
      )}
    </em>
  );
}

export default function ScenarioPanel({
  project,
  currentMode,
  onSave,
  onRemove,
  onRestore,
  baseline,
  comparison,
  comparisonResult,
  onSelectBaseline,
  onSelectComparison,
  unifiedMode,
  onChooseUnifiedMode,
  onProjectSide,
  onAlignBoth,
  onClearProjection,
}: Props) {
  const [name, setName] = useState("");
  const delta = comparisonResult?.deltaMs ?? 0;
  const outcome = comparisonResult?.outcome ?? "equal";
  const changes = comparisonResult?.changes ?? [];
  const eitherProjected =
    comparisonResult?.baselineProjected ||
    comparisonResult?.comparisonProjected;

  return (
    <section className="module-page scenarios-page">
      <div className="module-heading">
        <div>
          <span className="eyebrow">04 / SCENARIOS</span>
          <h1>方案对比</h1>
          <p>保存关键参数快照，判断一次调整是否真的缩短了等待。</p>
        </div>
      </div>
      <div className="save-scenario-bar">
        <div className="save-icon">
          <GitCompareArrows size={18} />
        </div>
        <div className="save-prompt">
          <strong>将当前推演保存为方案</strong>
          <small>
            保留节点、依赖、并发策略、完成预算与本次假设（
            {modeLabel(currentMode)}）。
          </small>
        </div>
        <input
          className="scenario-name-input"
          placeholder={`例如：${project.title} · 并发优化`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="button button-primary"
          onClick={() => {
            if (onSave(name)) setName("");
          }}
        >
          <Plus size={15} /> 保存快照
        </button>
      </div>
      {!project.scenarios.length ? (
        <div className="scenario-empty">
          <div className="empty-mark">A/B</div>
          <h3>还没有保存的方案</h3>
          <p>
            先在时序推演里调整并发或节点参数，再保存快照。之后可以在这里查看完成时间差异。
          </p>
        </div>
      ) : (
        <>
          <div className="compare-selectors">
            <div>
              <span className="compare-label">基准方案</span>
              <select
                value={baseline?.id ?? ""}
                onChange={(event) => onSelectBaseline(event.target.value)}
              >
                {project.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="compare-vs">VS</span>
            <div>
              <span className="compare-label">对照方案</span>
              <select
                value={comparison?.id ?? ""}
                onChange={(event) => onSelectComparison(event.target.value)}
              >
                {project.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {baseline && comparison && comparisonResult && (
            <>
              {comparisonResult.assumptionsDiffer && (
                <div className="assumption-warning">
                  <div className="assumption-warning-head">
                    <AlertTriangle size={15} />
                    <strong>
                      两侧推演假设不同，完成时间不能直接归因于参数调整
                    </strong>
                  </div>
                  <p>
                    基准方案按「{modeLabel(comparisonResult.baselineMode)}
                    」假设保存，对照方案按「
                    {modeLabel(comparisonResult.comparisonMode)}
                    」假设保存。界面上的时间差主要来自假设差异。
                    {(comparisonResult.baselineAssumptionLegacy ||
                      comparisonResult.comparisonAssumptionLegacy) &&
                      " 其中缺少假设记录的旧快照按当前假设解释，并非损坏数据。"}
                  </p>
                  <div className="assumption-actions">
                    <span className="toolbar-label">统一假设</span>
                    <div className="segmented-control">
                      {SIMULATION_MODES.map((item) => (
                        <button
                          key={item.id}
                          className={unifiedMode === item.id ? "selected" : ""}
                          onClick={() => onChooseUnifiedMode(item.id)}
                        >
                          <b>{item.label}</b>
                          <small>{item.sub}</small>
                        </button>
                      ))}
                    </div>
                    <button
                      className="button button-secondary"
                      onClick={() => onProjectSide("baseline", unifiedMode)}
                      disabled={comparisonResult.baselineProjected}
                    >
                      基准侧按「{modeLabel(unifiedMode)}」重算
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => onProjectSide("comparison", unifiedMode)}
                      disabled={comparisonResult.comparisonProjected}
                    >
                      对照侧按「{modeLabel(unifiedMode)}」重算
                    </button>
                    <button
                      className="button button-primary"
                      onClick={() => onAlignBoth(unifiedMode)}
                    >
                      两侧都按「{modeLabel(unifiedMode)}」重算
                    </button>
                  </div>
                  <p className="assumption-note">
                    重算只用于本次对比，不会改写已保存的快照。
                  </p>
                </div>
              )}
              {!comparisonResult.assumptionsDiffer && eitherProjected && (
                <div className="assumption-aligned">
                  已按统一的「{modeLabel(unifiedMode)}」假设重算，时间差可比。
                  <button onClick={onClearProjection}>
                    <RotateCcw size={12} /> 还原快照原值
                  </button>
                </div>
              )}
              <div className="comparison-result">
                <article className="compare-card">
                  <span>基准完成时间</span>
                  <strong>{formatDuration(baseline.completionMs)}</strong>
                  <small>
                    {baseline.name} · {baseline.nodes.length} 节点
                  </small>
                  <AssumptionTag
                    mode={comparisonResult.baselineMode}
                    projected={comparisonResult.baselineProjected}
                    legacy={comparisonResult.baselineAssumptionLegacy}
                    currentMode={currentMode}
                  />
                </article>
                <div className="delta-card">
                  <span>方案差异</span>
                  <strong
                    className={
                      comparisonResult.assumptionsDiffer
                        ? "delta-unknown"
                        : outcome === "slower"
                          ? "delta-bad"
                          : "delta-good"
                    }
                  >
                    {outcome === "equal" ? null : outcome === "faster" ? (
                      <ArrowDownRight size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                    {formatDuration(Math.abs(delta))}
                  </strong>
                  <small>
                    {comparisonResult.assumptionsDiffer
                      ? "假设不同 · 请先统一假设再比较"
                      : outcome === "equal"
                        ? "两方案预算持平"
                        : outcome === "faster"
                          ? "对照方案更快"
                          : "对照方案更慢"}
                  </small>
                </div>
                <article className="compare-card compare-card-accent">
                  <span>对照完成时间</span>
                  <strong>{formatDuration(comparison.completionMs)}</strong>
                  <small>
                    {comparison.name} · {comparison.nodes.length} 节点
                  </small>
                  <AssumptionTag
                    mode={comparisonResult.comparisonMode}
                    projected={comparisonResult.comparisonProjected}
                    legacy={comparisonResult.comparisonAssumptionLegacy}
                    currentMode={currentMode}
                  />
                </article>
              </div>
            </>
          )}
          <div className="snapshot-list">
            <div className="snapshot-heading">
              <span className="section-label">已保存快照</span>
              <span>{project.scenarios.length} 个方案</span>
            </div>
            {project.scenarios.map((scenario) => {
              const mode = scenario.assumptionMode;
              return (
                <div className="snapshot-row" key={scenario.id}>
                  <span className="snapshot-badge">S</span>
                  <div className="snapshot-info">
                    <strong>{scenario.name}</strong>
                    <small>
                      {new Date(scenario.createdAt).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {scenario.concurrencyLimit
                        ? `${scenario.concurrencyLimit} 路并发`
                        : "不限并发"}
                      {" · "}
                      {mode ? (
                        <>假设 · {modeLabel(mode)}</>
                      ) : (
                        <span
                          className="legacy-hint"
                          title={`旧版快照未记录假设，按当前假设（${modeLabel(currentMode)}）解释`}
                        >
                          旧快照 · 按当前假设（{modeLabel(currentMode)}）解释
                        </span>
                      )}
                    </small>
                  </div>
                  <b className="snapshot-time">
                    {formatDuration(scenario.completionMs)}
                  </b>
                  <button
                    className="icon-button"
                    title={`恢复此方案（含保存时的假设${mode ? ` · ${modeLabel(mode)}` : "，旧快照沿用当前假设"}）`}
                    aria-label={`恢复方案 ${scenario.name}`}
                    onClick={() => onRestore(scenario.id)}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    className="icon-button danger-button"
                    title="删除方案"
                    aria-label={`删除方案 ${scenario.name}`}
                    onClick={() => onRemove(scenario.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          {changes.length > 0 && (
            <div className="change-summary">
              <strong>参数变化</strong>
              {changes.map((change) => (
                <span key={change}>{change}</span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
