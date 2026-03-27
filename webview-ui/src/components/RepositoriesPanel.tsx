import { useState, useEffect } from "react";
import { ComposerRepository } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  repositories: ComposerRepository[];
}

function RepositoriesPanel({ repositories }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState("vcs");
  const [addUrl, setAddUrl] = useState("");

  useEffect(() => {
    if (expanded) postMessage({ type: "requestRepositories" });
  }, [expanded]);

  const handleAdd = () => {
    if (!addUrl.trim()) return;
    postMessage({ type: "addRepository", repoType: addType, url: addUrl.trim() });
    setAddUrl("");
    setShowAdd(false);
  };

  const typeIcons: Record<string, string> = {
    vcs: "\u{1F310}", composer: "\u{1F4E6}", path: "\u{1F4C1}", artifact: "\u{1F4E5}", package: "\u{1F4CB}",
  };

  return (
    <div className="panel-section">
      <div className="search-panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">
          Repositories
          {repositories.length > 0 && <span className="scripts-count">{repositories.length}</span>}
        </span>
      </div>
      {expanded && (
        <div className="panel-body">
          <div className="panel-content">
            {repositories.length === 0 && (
              <div className="scripts-empty">No custom repositories. Using Packagist by default.</div>
            )}
            {repositories.map((repo) => (
              <div key={repo.index} className="script-row">
                <div className="script-info">
                  <span style={{ fontSize: 16, marginRight: 4 }}>{typeIcons[repo.type] || "\u{1F4E6}"}</span>
                  <span className="script-name">{repo.type}</span>
                  <code className="script-command">{repo.url || repo.path || JSON.stringify(repo.raw)}</code>
                </div>
                <button className="action-btn action-uninstall" onClick={() => postMessage({ type: "removeRepository", index: repo.index })} title="Remove">&#x1F5D1;</button>
              </div>
            ))}

            <div className="panel-actions-row">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(!showAdd)}>+ Add Repository</button>
            </div>

            {showAdd && (
              <div className="add-script-form" style={{ padding: "8px 0" }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="filter-select" value={addType} onChange={(e) => setAddType(e.target.value)}>
                    <option value="vcs">VCS (Git/SVN/Hg)</option>
                    <option value="composer">Composer (Satis/Packagist)</option>
                    <option value="path">Path (Local)</option>
                    <option value="artifact">Artifact (ZIP)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{addType === "path" ? "Path" : "URL"}</label>
                  <input className="search-input"
                    placeholder={addType === "path" ? "../my-package" : "https://github.com/vendor/repo.git"}
                    value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
                </div>
                <div className="add-script-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!addUrl.trim()}>Add</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RepositoriesPanel;
