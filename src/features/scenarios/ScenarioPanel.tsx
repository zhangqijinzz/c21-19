import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  EqualApproximately,
  GitCompareArrows,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  SIMULATION_MODE_LABELS,
  type LatencyProject,
  type ScenarioSnapshot,
  type SimulationMode,
} from "../../shared/domain/types";
import {
  getSnapshotSide,
  type ScenarioComparison,
  type ScenarioSide,
} from "./scenarioViewModel";

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
  onReplaySide: (side: "baseline" | "comparison", mode: SimulationMode) => void;
  onResetReplay: () => void;
}

function formatDuration(value: number): string {
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;
}

function AssumptionTag({
  side,
  currentMode,
}: {
  side: ScenarioSide;
  currentMode: SimulationMode;
}) {
  const note = side.legacy
    ? side.mode === currentMode
      ? "（旧快照·按当前假设）"
      : "（旧快照·重推演）"
    : side.replayed
      ? " · 重推演"
      : "";
  return (
    <em
      className={`assumption-tag${side.legacy ? " assumption-tag-legacy" : ""}${side.replayed ? " assumption-tag-replayed" : ""}`}
    >
      {SIMULATION_MODE_LABELS[side.mode]}
      {note}
    </em>
  );
}

function SideAssumption({
  snapshot,
  side,
  currentMode,
}: {
  snapshot: ScenarioSnapshot;
  side: ScenarioSide;
  currentMode: SimulationMode;
}) {
  if (!side.replayed)
    return <SnapshotAssumption snapshot={snapshot} currentMode={currentMode} />;
  return (
    <>
      {!side.legacy && (
        <>
          <SnapshotAssumption snapshot={snapshot} currentMode={currentMode} />{" "}
          →{" "}
        </>
      )}
      <AssumptionTag side={side} currentMode={currentMode} />
    </>
  );
}

function SnapshotAssumption({
  snapshot,
  currentMode,
}: {
  snapshot: ScenarioSnapshot;
  currentMode: SimulationMode;
}) {
  const mode = snapshot.assumptionMode ?? currentMode;
  return (
    <em
      className={`assumption-tag${snapshot.assumptionMode ? "" : " assumption-tag-legacy"}`}
      title={
        snapshot.assumptionMode
          ? `保存时使用${SIMULATION_MODE_LABELS[mode]}情境`
          : "该快照保存时未记录预算假设，按当前假设处理"
      }
    >
      {SIMULATION_MODE_LABELS[mode]}
      {snapshot.assumptionMode ? "" : " · 未记录"}
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
  onReplaySide,
  onResetReplay,
}: Props) {
  const [name, setName] = useState("");
  const delta = comparisonResult?.deltaMs ?? 0;
  const outcome = comparisonResult?.outcome ?? "equal";
  const changes = comparisonResult?.changes ?? [];
  const baselineSide = comparisonResult?.baselineSide;
  const comparisonSide = comparisonResult?.comparisonSide;
  const assumptionsDiffer = comparisonResult?.assumptionsDiffer ?? false;
  const unified = comparisonResult?.unified ?? false;
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
            保留节点、依赖、并发策略与完成预算，并记录本次使用的 「
            {SIMULATION_MODE_LABELS[currentMode]}」假设。
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
          {baseline && comparison && baselineSide && comparisonSide && (
            <>
              {comparisonResult.notices.length > 0 && (
                <div className="assumption-notes">
                  {comparisonResult.notices.map((note) => (
                    <span key={note}>{note}</span>
                  ))}
                </div>
              )}
              {assumptionsDiffer && (
                <div className="assumption-banner">
                  <div className="assumption-banner-copy">
                    <CircleAlert size={15} />
                    <div>
                      <strong>
                        两侧预算假设不同，时间差不能直接归因于参数调整
                      </strong>
                      <small>
                        请选择统一假设，把其中一侧按快照参数重新推演后再比较；原快照不会被修改。
                      </small>
                    </div>
                  </div>
                  <div className="replay-actions">
                    <span>按基准假设推演对照</span>
                    <button
                      className="button button-neutral replay-button"
                      onClick={() =>
                        onReplaySide("comparison", baselineSide.mode)
                      }
                    >
                      <Play size={12} /> 对照按「
                      {SIMULATION_MODE_LABELS[baselineSide.mode]}」重推演
                    </button>
                    <span>按对照假设推演基准</span>
                    <button
                      className="button button-neutral replay-button"
                      onClick={() =>
                        onReplaySide("baseline", comparisonSide.mode)
                      }
                    >
                      <Play size={12} /> 基准按「
                      {SIMULATION_MODE_LABELS[comparisonSide.mode]}」重推演
                    </button>
                  </div>
                </div>
              )}
              {unified && (
                <div className="assumption-banner assumption-banner-ok">
                  <div className="assumption-banner-copy">
                    <EqualApproximately size={15} />
                    <div>
                      <strong>
                        已统一为「{SIMULATION_MODE_LABELS[baselineSide.mode]}
                        」假设
                      </strong>
                      <small>
                        重推演仅用于本次对比，没有改动快照。可恢复保存时的原始数值。
                      </small>
                    </div>
                  </div>
                  <button
                    className="button button-neutral replay-button"
                    onClick={onResetReplay}
                  >
                    <RotateCcw size={12} /> 恢复快照原值
                  </button>
                </div>
              )}
              <div className="comparison-result">
                <article className="compare-card">
                  <span>基准完成时间</span>
                  <strong>{formatDuration(baselineSide.completionMs)}</strong>
                  <small>
                    {baseline.name} · {baseline.nodes.length} 节点 ·{" "}
                    <SideAssumption
                      snapshot={baseline}
                      side={baselineSide}
                      currentMode={currentMode}
                    />
                  </small>
                </article>
                <div className="delta-card">
                  <span>方案差异</span>
                  <strong
                    className={
                      assumptionsDiffer
                        ? "delta-warn"
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
                    {assumptionsDiffer
                      ? "时间差混入了假设差异"
                      : unified
                        ? `统一假设下的参数差异`
                        : outcome === "equal"
                          ? "两方案预算持平"
                          : outcome === "faster"
                            ? "对照方案更快"
                            : "对照方案更慢"}
                  </small>
                </div>
                <article className="compare-card compare-card-accent">
                  <span>对照完成时间</span>
                  <strong>{formatDuration(comparisonSide.completionMs)}</strong>
                  <small>
                    {comparison.name} · {comparison.nodes.length} 节点 ·{" "}
                    <SideAssumption
                      snapshot={comparison}
                      side={comparisonSide}
                      currentMode={currentMode}
                    />
                  </small>
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
              const side = getSnapshotSide(scenario, currentMode);
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
                        : "不限并发"}{" "}
                      ·{" "}
                      <SnapshotAssumption
                        snapshot={scenario}
                        currentMode={currentMode}
                      />
                    </small>
                  </div>
                  <b
                    className={`snapshot-time${side.legacy ? " snapshot-time-replayed" : ""}`}
                    title={
                      side.legacy
                        ? `旧快照未记录假设，数值已按当前「${SIMULATION_MODE_LABELS[side.mode]}」情境重新推演；保存时原值为 ${formatDuration(scenario.completionMs)}`
                        : undefined
                    }
                  >
                    {formatDuration(side.completionMs)}
                  </b>
                  <button
                    className="icon-button"
                    title="恢复此方案（连同其预算假设）"
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
