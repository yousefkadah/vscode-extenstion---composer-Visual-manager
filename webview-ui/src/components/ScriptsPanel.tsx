import { useState, useEffect } from "react";
import { ComposerScript, ScriptSuggestion, MessageToWebview } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

const SUGGESTIONS: ScriptSuggestion[] = [
  {
    tool: "phpstan",
    description: "Static analysis - find bugs before production",
    package: "phpstan/phpstan",
    dev: true,
    scripts: [
      { name: "phpstan", command: "vendor/bin/phpstan analyse" },
      { name: "phpstan:baseline", command: "vendor/bin/phpstan analyse --generate-baseline" },
    ],
  },
  {
    tool: "rector",
    description: "Automated refactoring and instant PHP upgrades",
    package: "rector/rector",
    dev: true,
    scripts: [
      { name: "rector", command: "vendor/bin/rector process" },
      { name: "rector:dry", command: "vendor/bin/rector process --dry-run" },
    ],
  },
  {
    tool: "pint",
    description: "Laravel code style fixer (built on PHP-CS-Fixer)",
    package: "laravel/pint",
    dev: true,
    scripts: [
      { name: "pint", command: "vendor/bin/pint" },
      { name: "pint:test", command: "vendor/bin/pint --test" },
    ],
  },
  {
    tool: "pest",
    description: "Elegant testing framework with focus on simplicity",
    package: "pestphp/pest",
    dev: true,
    scripts: [
      { name: "test", command: "vendor/bin/pest" },
      { name: "test:coverage", command: "vendor/bin/pest --coverage" },
      { name: "test:parallel", command: "vendor/bin/pest --parallel" },
      { name: "test:watch", command: "vendor/bin/pest --watch" },
    ],
  },
  {
    tool: "phpunit",
    description: "The PHP testing framework",
    package: "phpunit/phpunit",
    dev: true,
    scripts: [
      { name: "test", command: "vendor/bin/phpunit" },
      { name: "test:coverage", command: "vendor/bin/phpunit --coverage-html coverage" },
    ],
  },
  {
    tool: "php-cs-fixer",
    description: "Fix code to follow PHP coding standards",
    package: "friendsofphp/php-cs-fixer",
    dev: true,
    scripts: [
      { name: "cs:fix", command: "vendor/bin/php-cs-fixer fix" },
      { name: "cs:check", command: "vendor/bin/php-cs-fixer fix --dry-run --diff" },
    ],
  },
  {
    tool: "phpmd",
    description: "Detect code smells, unused code, and complexity",
    package: "phpmd/phpmd",
    dev: true,
    scripts: [
      { name: "phpmd", command: "vendor/bin/phpmd src text cleancode,codesize,controversial,design,naming,unusedcode" },
    ],
  },
  {
    tool: "psalm",
    description: "Static analysis tool for finding errors in PHP",
    package: "vimeo/psalm",
    dev: true,
    scripts: [
      { name: "psalm", command: "vendor/bin/psalm" },
      { name: "psalm:fix", command: "vendor/bin/psalm --alter --issues=all" },
    ],
  },
];

interface Props {
  scripts: ComposerScript[];
}

function ScriptsPanel({ scripts }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [editingScript, setEditingScript] = useState<string | null>(null);
  const [editCommand, setEditCommand] = useState("");
  const [scriptOutput, setScriptOutput] = useState<string | null>(null);
  const [runningScript, setRunningScript] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      if (msg.type === "scriptOutput") {
        setScriptOutput(msg.output);
        setRunningScript(null);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (expanded) {
      postMessage({ type: "requestScripts" });
    }
  }, [expanded]);

  const handleAdd = () => {
    if (!newName.trim() || !newCommand.trim()) return;
    postMessage({ type: "addScript", name: newName.trim(), command: newCommand.trim() });
    setNewName("");
    setNewCommand("");
    setShowAddForm(false);
  };

  const handleRemove = (name: string) => {
    postMessage({ type: "removeScript", name });
  };

  const handleEdit = (script: ComposerScript) => {
    setEditingScript(script.name);
    setEditCommand(
      Array.isArray(script.command) ? script.command.join(" && ") : script.command
    );
  };

  const handleSaveEdit = () => {
    if (!editingScript || !editCommand.trim()) return;
    postMessage({ type: "editScript", name: editingScript, command: editCommand.trim() });
    setEditingScript(null);
    setEditCommand("");
  };

  const handleRun = (name: string) => {
    setRunningScript(name);
    setScriptOutput(null);
    postMessage({ type: "runScript", name });
  };

  const handleAddSuggestion = (tool: string) => {
    postMessage({ type: "addSuggestion", tool });
  };

  const existingNames = new Set(scripts.map((s) => s.name));

  const toolIcons: Record<string, string> = {
    phpstan: "\u{1F50D}",
    rector: "\u{1F527}",
    pint: "\u{1F3A8}",
    pest: "\u{1F41B}",
    phpunit: "\u{2705}",
    "php-cs-fixer": "\u{1F3A8}",
    phpmd: "\u{1F4CA}",
    psalm: "\u{1F50D}",
  };

  return (
    <div className="scripts-panel">
      <div
        className="search-panel-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="search-panel-toggle">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="search-panel-title">
          Scripts
          {scripts.length > 0 && (
            <span className="scripts-count">{scripts.length}</span>
          )}
        </span>
      </div>

      {expanded && (
        <div className="scripts-body">
          {/* Current Scripts */}
          {scripts.length > 0 && (
            <div className="scripts-list">
              <div className="scripts-list-header">
                <span className="scripts-section-title">Current Scripts</span>
              </div>
              {scripts.map((script) => (
                <div key={script.name} className="script-row">
                  {editingScript === script.name ? (
                    <div className="script-edit-form">
                      <div className="script-edit-name">{script.name}</div>
                      <div className="script-edit-row">
                        <input
                          type="text"
                          className="search-input"
                          value={editCommand}
                          onChange={(e) => setEditCommand(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>
                          Save
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingScript(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="script-info">
                        <span className="script-name">{script.name}</span>
                        <span className="script-command">
                          {Array.isArray(script.command)
                            ? script.command.join(" && ")
                            : script.command}
                        </span>
                      </div>
                      <div className="script-actions">
                        <button
                          className="action-btn"
                          title="Run script"
                          onClick={() => handleRun(script.name)}
                          disabled={runningScript === script.name}
                        >
                          {runningScript === script.name ? "\u23F3" : "\u25B6\uFE0F"}
                        </button>
                        <button
                          className="action-btn"
                          title="Edit script"
                          onClick={() => handleEdit(script)}
                        >
                          &#x270F;&#xFE0F;
                        </button>
                        <button
                          className="action-btn action-uninstall"
                          title="Remove script"
                          onClick={() => handleRemove(script.name)}
                        >
                          &#x1F5D1;
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {scripts.length === 0 && (
            <div className="scripts-empty">
              No scripts defined. Add one manually or use a suggestion below.
            </div>
          )}

          {/* Script Output */}
          {scriptOutput !== null && (
            <div className="script-output">
              <div className="script-output-header">
                <span>Output</span>
                <button
                  className="action-btn"
                  onClick={() => setScriptOutput(null)}
                  title="Close"
                >
                  &#x2715;
                </button>
              </div>
              <pre className="script-output-content">{scriptOutput}</pre>
            </div>
          )}

          {/* Add Custom Script */}
          <div className="scripts-add-section">
            {!showAddForm ? (
              <button
                className="btn btn-secondary add-script-btn"
                onClick={() => setShowAddForm(true)}
              >
                + Add Custom Script
              </button>
            ) : (
              <div className="add-script-form">
                <div className="form-group">
                  <label className="form-label">Script Name</label>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="e.g. test, lint, deploy"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Command</label>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="e.g. vendor/bin/phpunit --colors"
                    value={newCommand}
                    onChange={(e) => setNewCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
                <div className="add-script-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAdd}
                    disabled={!newName.trim() || !newCommand.trim()}
                  >
                    Add Script
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewName("");
                      setNewCommand("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="scripts-suggestions">
            <div className="scripts-section-title">Quick Setup</div>
            <div className="suggestion-grid">
              {SUGGESTIONS.map((s) => {
                const hasAllScripts = s.scripts.every((sc) =>
                  existingNames.has(sc.name)
                );
                return (
                  <div key={s.tool} className="suggestion-card">
                    <div className="suggestion-header">
                      <span className="suggestion-icon">
                        {toolIcons[s.tool] || "\u{1F4E6}"}
                      </span>
                      <div className="suggestion-title-block">
                        <span className="suggestion-name">{s.tool}</span>
                        <span className="suggestion-pkg">{s.package}</span>
                      </div>
                    </div>
                    <div className="suggestion-desc">{s.description}</div>
                    <div className="suggestion-scripts-preview">
                      {s.scripts.map((sc) => (
                        <code key={sc.name} className="suggestion-script-name">
                          {sc.name}
                        </code>
                      ))}
                    </div>
                    <button
                      className={`btn btn-sm suggestion-btn ${hasAllScripts ? "btn-secondary" : "btn-primary"}`}
                      onClick={() => handleAddSuggestion(s.tool)}
                      disabled={hasAllScripts}
                    >
                      {hasAllScripts
                        ? "Already Added"
                        : `Install & Add Scripts`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScriptsPanel;
