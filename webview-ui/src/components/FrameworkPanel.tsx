import { useState, useEffect } from "react";
import { FrameworkInfo, MessageToWebview } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  frameworkInfo: FrameworkInfo | null;
}

const FRAMEWORK_LABELS: Record<string, string> = {
  laravel: "Laravel",
  symfony: "Symfony",
  yii: "Yii",
  cakephp: "CakePHP",
  codeigniter: "CodeIgniter",
  slim: "Slim",
  wordpress: "WordPress",
  none: "No Framework",
};

const FRAMEWORK_COLORS: Record<string, string> = {
  laravel: "#ff2d20",
  symfony: "#000000",
  yii: "#40b681",
  cakephp: "#d33c43",
  codeigniter: "#dd4814",
  slim: "#719e40",
  wordpress: "#21759b",
};

function FrameworkPanel({ frameworkInfo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [output, setOutput] = useState<{ title: string; content: string } | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (expanded) postMessage({ type: "requestFrameworkInfo" });
  }, [expanded]);

  useEffect(() => {
    const handler = (event: MessageEvent<MessageToWebview>) => {
      if (event.data.type === "commandOutput") {
        setOutput({ title: event.data.title, content: event.data.output });
        setRunning(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!frameworkInfo || frameworkInfo.type === "none") {
    if (!expanded) return null;
  }

  const fw = frameworkInfo;
  const categories = fw ? [...new Set(fw.commands.map((c) => c.category))] : [];
  const filteredCommands = fw?.commands.filter(
    (c) => filterCategory === "all" || c.category === filterCategory
  ) || [];

  const runCmd = (command: string) => {
    setRunning(true);
    setOutput(null);
    postMessage({ type: "runFrameworkCommand", command });
  };

  return (
    <div className="panel-section">
      <div className="search-panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">
          {fw ? FRAMEWORK_LABELS[fw.type] || fw.type : "Framework"}
          {fw?.version && (
            <span className="framework-version">{fw.version}</span>
          )}
        </span>
      </div>
      {expanded && fw && fw.type !== "none" && (
        <div className="panel-body">
          {/* Quick Actions */}
          {fw.quickActions.length > 0 && (
            <div className="framework-quick-actions">
              <div className="scripts-section-title" style={{ padding: "8px 14px" }}>Quick Actions</div>
              <div className="quick-action-grid">
                {fw.quickActions.map((action) => (
                  <button
                    key={action.command}
                    className="quick-action-btn"
                    onClick={() => runCmd(action.command)}
                    disabled={running}
                    title={action.description}
                  >
                    <span className="quick-action-icon">{action.icon}</span>
                    <span className="quick-action-label">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Command Output */}
          {output && (
            <div className="script-output">
              <div className="script-output-header">
                <span>{output.title}</span>
                <button className="action-btn" onClick={() => setOutput(null)} title="Close">&#x2715;</button>
              </div>
              <pre className="script-output-content">{output.content}</pre>
            </div>
          )}

          {running && (
            <div className="scripts-empty">Running command...</div>
          )}

          {/* All Commands */}
          {fw.commands.length > 0 && (
            <div className="framework-commands">
              <div className="framework-commands-header">
                <span className="scripts-section-title">Commands</span>
                <select
                  className="filter-select"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="framework-command-list">
                {filteredCommands.map((cmd) => (
                  <div key={cmd.name} className="script-row">
                    <div className="script-info">
                      <span className="script-name">{cmd.name}</span>
                      <span className="script-command">{cmd.description}</span>
                    </div>
                    <button
                      className="action-btn"
                      title={`Run: ${cmd.command}`}
                      onClick={() => runCmd(cmd.command)}
                      disabled={running}
                    >
                      &#x25B6;&#xFE0F;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {expanded && (!fw || fw.type === "none") && (
        <div className="panel-body">
          <div className="scripts-empty">No PHP framework detected in composer.json.</div>
        </div>
      )}
    </div>
  );
}

export default FrameworkPanel;
