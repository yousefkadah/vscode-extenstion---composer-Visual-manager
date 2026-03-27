import { useState, useEffect } from "react";
import { SuggestEntry } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  suggests: SuggestEntry[];
}

function SuggestsPanel({ suggests }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && suggests.length === 0) postMessage({ type: "requestSuggests" });
  }, [expanded]);

  const notInstalled = suggests.filter((s) => !s.installed);

  return (
    <div className="panel-section">
      <div className="search-panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">
          Suggested Packages
          {notInstalled.length > 0 && <span className="scripts-count">{notInstalled.length}</span>}
        </span>
      </div>
      {expanded && (
        <div className="panel-body">
          <div className="panel-actions-row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--vscode-panel-border, #333)" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => postMessage({ type: "requestSuggests" })}>Refresh</button>
          </div>
          <div className="panel-content" style={{ maxHeight: 300, overflow: "auto" }}>
            {suggests.length === 0 && (
              <div className="scripts-empty">No package suggestions found.</div>
            )}
            {suggests.map((s) => (
              <div key={s.name} className="script-row">
                <div className="script-info">
                  <span className="script-name">{s.name}</span>
                  <span className="script-command">{s.reason}</span>
                </div>
                <div className="script-actions">
                  {s.installed ? (
                    <span className="security-ok" title="Already installed">&#x2714;</span>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => postMessage({ type: "installSuggested", packageName: s.name })}
                    >
                      Install
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SuggestsPanel;
