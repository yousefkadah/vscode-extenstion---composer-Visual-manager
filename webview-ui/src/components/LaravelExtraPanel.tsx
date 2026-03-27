import { useState, useEffect } from "react";
import { LaravelExtra, FrameworkInfo } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  laravelExtra: LaravelExtra | null;
  frameworkInfo: FrameworkInfo | null;
}

function LaravelExtraPanel({ laravelExtra, frameworkInfo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"dont-discover" | "providers" | "aliases">("dont-discover");

  // Add form state
  const [newValue, setNewValue] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newClassName, setNewClassName] = useState("");

  // Only show for Laravel projects
  if (!frameworkInfo || frameworkInfo.type !== "laravel") return null;

  const handleExpand = () => {
    if (!expanded) postMessage({ type: "requestLaravelExtra" });
    setExpanded(!expanded);
  };

  const data = laravelExtra || { dontDiscover: [], providers: [], aliases: {} };

  const handleAddDontDiscover = () => {
    if (!newValue.trim()) return;
    postMessage({ type: "addDontDiscover", packageName: newValue.trim() });
    setNewValue("");
  };

  const handleAddProvider = () => {
    if (!newValue.trim()) return;
    postMessage({ type: "addLaravelProvider", provider: newValue.trim() });
    setNewValue("");
  };

  const handleAddAlias = () => {
    if (!newAlias.trim() || !newClassName.trim()) return;
    postMessage({ type: "addLaravelAlias", alias: newAlias.trim(), className: newClassName.trim() });
    setNewAlias("");
    setNewClassName("");
  };

  return (
    <div className="panel-section">
      <div className="search-panel-header" onClick={handleExpand}>
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">
          Laravel Configuration
        </span>
      </div>
      {expanded && (
        <div className="panel-body">
          <div className="source-tabs">
            <button className={`source-tab ${activeTab === "dont-discover" ? "active" : ""}`} onClick={() => setActiveTab("dont-discover")}>
              Don't Discover ({data.dontDiscover.length})
            </button>
            <button className={`source-tab ${activeTab === "providers" ? "active" : ""}`} onClick={() => setActiveTab("providers")}>
              Providers ({data.providers.length})
            </button>
            <button className={`source-tab ${activeTab === "aliases" ? "active" : ""}`} onClick={() => setActiveTab("aliases")}>
              Aliases ({Object.keys(data.aliases).length})
            </button>
          </div>

          <div className="panel-content">
            {/* Don't Discover */}
            {activeTab === "dont-discover" && (
              <>
                <p className="form-hint" style={{ margin: "8px 0" }}>
                  Packages listed here will not have their service providers auto-discovered.
                  Use "*" to disable all auto-discovery.
                </p>
                {data.dontDiscover.map((pkg) => (
                  <div key={pkg} className="script-row">
                    <code className="script-name">{pkg}</code>
                    <button className="action-btn action-uninstall" onClick={() => postMessage({ type: "removeDontDiscover", packageName: pkg })}>&#x1F5D1;</button>
                  </div>
                ))}
                <div className="add-inline" style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="search-input" placeholder="vendor/package or *" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDontDiscover()} />
                  <button className="btn btn-primary btn-sm" onClick={handleAddDontDiscover} disabled={!newValue.trim()}>Add</button>
                </div>
              </>
            )}

            {/* Providers */}
            {activeTab === "providers" && (
              <>
                <p className="form-hint" style={{ margin: "8px 0" }}>
                  Manually register service providers that should always be loaded.
                </p>
                {data.providers.map((prov) => (
                  <div key={prov} className="script-row">
                    <code className="script-name" style={{ fontSize: 11 }}>{prov}</code>
                    <button className="action-btn action-uninstall" onClick={() => postMessage({ type: "removeLaravelProvider", provider: prov })}>&#x1F5D1;</button>
                  </div>
                ))}
                <div className="add-inline" style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="search-input" placeholder="App\Providers\MyServiceProvider" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddProvider()} />
                  <button className="btn btn-primary btn-sm" onClick={handleAddProvider} disabled={!newValue.trim()}>Add</button>
                </div>
              </>
            )}

            {/* Aliases */}
            {activeTab === "aliases" && (
              <>
                <p className="form-hint" style={{ margin: "8px 0" }}>
                  Register class aliases for use in your application.
                </p>
                {Object.entries(data.aliases).map(([alias, cls]) => (
                  <div key={alias} className="script-row">
                    <div className="script-info">
                      <span className="script-name">{alias}</span>
                      <span className="autoload-arrow">{"\u2192"}</span>
                      <code className="script-command" style={{ fontSize: 11 }}>{cls}</code>
                    </div>
                    <button className="action-btn action-uninstall" onClick={() => postMessage({ type: "removeLaravelAlias", alias })}>&#x1F5D1;</button>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="search-input" placeholder="Alias" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} style={{ flex: 1 }} />
                    <input className="search-input" placeholder="Full\Class\Name" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} style={{ flex: 2 }} />
                    <button className="btn btn-primary btn-sm" onClick={handleAddAlias} disabled={!newAlias.trim() || !newClassName.trim()}>Add</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LaravelExtraPanel;
