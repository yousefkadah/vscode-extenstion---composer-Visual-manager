import { useState, useRef, useCallback, useEffect } from "react";
import {
  PackagistSearchResult,
  ComposerPackage,
  InstallSource,
  InstallOptions,
  MessageToWebview,
} from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  searchResults: PackagistSearchResult[];
  installedPackages: ComposerPackage[];
}

const defaultOptions: InstallOptions = {
  dev: false,
  version: "",
  preferSource: false,
  preferDist: false,
  sortPackages: false,
  noUpdate: false,
  noInstall: false,
  withDependencies: false,
};

function SearchPanel({ searchResults, installedPackages }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<InstallSource>("packagist");
  const [options, setOptions] = useState<InstallOptions>({ ...defaultOptions });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Packagist state
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // GitHub state
  const [githubUrl, setGithubUrl] = useState("");
  const [githubPackageName, setGithubPackageName] = useState("");

  // Local path state
  const [localPath, setLocalPath] = useState("");
  const [localPackageName, setLocalPackageName] = useState("");

  // Listen for local path selection from VS Code
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      if (event.data.type === "localPathSelected") {
        setLocalPath(event.data.path);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (value.length < 2) return;
    debounceRef.current = setTimeout(() => {
      postMessage({ type: "search", query: value });
    }, 300);
  }, []);

  const isInstalled = (name: string) =>
    installedPackages.some((p) => p.name === name);

  const handlePackagistInstall = (name: string) => {
    postMessage({ type: "install", packageName: name, options });
    setQuery("");
  };

  const handlePackagistUninstall = (name: string) => {
    postMessage({ type: "uninstall", packageName: name });
  };

  const handleGithubInstall = () => {
    if (!githubUrl.trim()) return;
    postMessage({
      type: "installFromGithub",
      url: githubUrl.trim(),
      packageName: githubPackageName.trim() || undefined,
      options,
    });
    setGithubUrl("");
    setGithubPackageName("");
  };

  const handleLocalInstall = () => {
    if (!localPath.trim()) return;
    postMessage({
      type: "installFromPath",
      path: localPath.trim(),
      packageName: localPackageName.trim() || undefined,
      options,
    });
    setLocalPath("");
    setLocalPackageName("");
  };

  const handleBrowse = () => {
    postMessage({ type: "browseLocalPath" });
  };

  const updateOption = <K extends keyof InstallOptions>(
    key: K,
    value: InstallOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const formatDownloads = (count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="search-panel">
      <div
        className="search-panel-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="search-panel-toggle">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="search-panel-title">Add Package</span>
      </div>

      {expanded && (
        <div className="search-panel-body">
          {/* Source Tabs */}
          <div className="source-tabs">
            <button
              className={`source-tab ${activeTab === "packagist" ? "active" : ""}`}
              onClick={() => setActiveTab("packagist")}
            >
              <span className="tab-icon">&#x1F4E6;</span> Packagist
            </button>
            <button
              className={`source-tab ${activeTab === "github" ? "active" : ""}`}
              onClick={() => setActiveTab("github")}
            >
              <span className="tab-icon">&#x1F310;</span> GitHub / VCS
            </button>
            <button
              className={`source-tab ${activeTab === "local" ? "active" : ""}`}
              onClick={() => setActiveTab("local")}
            >
              <span className="tab-icon">&#x1F4C1;</span> Local Path
            </button>
          </div>

          {/* ===== Packagist Tab ===== */}
          {activeTab === "packagist" && (
            <div className="tab-content">
              <input
                type="text"
                className="search-input"
                placeholder="Search Packagist (min 2 characters)..."
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
              />
              {query.length >= 2 && searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((result) => {
                    const installed = isInstalled(result.name);
                    return (
                      <div key={result.name} className="search-result-item">
                        <div className="search-result-info">
                          <div className="search-result-name">
                            {result.name}
                          </div>
                          <div className="search-result-desc">
                            {result.description}
                          </div>
                          <div className="search-result-meta">
                            <span>
                              &#x2B07; {formatDownloads(result.downloads)}
                            </span>
                            <span>&#x2B50; {result.favers}</span>
                          </div>
                        </div>
                        <div className="search-result-actions">
                          {installed ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                handlePackagistUninstall(result.name)
                              }
                            >
                              Uninstall
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() =>
                                handlePackagistInstall(result.name)
                              }
                            >
                              {options.dev ? "Require --dev" : "Require"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {query.length >= 2 && searchResults.length === 0 && (
                <div className="search-no-results">No packages found.</div>
              )}
            </div>
          )}

          {/* ===== GitHub / VCS Tab ===== */}
          {activeTab === "github" && (
            <div className="tab-content">
              <div className="form-group">
                <label className="form-label">Repository URL</label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="https://github.com/vendor/package.git"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  autoFocus
                />
                <span className="form-hint">
                  Supports GitHub, GitLab, Bitbucket, or any Git/SVN/Hg URL
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Package Name{" "}
                  <span className="form-optional">(optional)</span>
                </label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="vendor/package (auto-detected from URL if empty)"
                  value={githubPackageName}
                  onChange={(e) => setGithubPackageName(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary install-btn"
                onClick={handleGithubInstall}
                disabled={!githubUrl.trim()}
              >
                {options.dev ? "Require --dev from VCS" : "Require from VCS"}
              </button>
            </div>
          )}

          {/* ===== Local Path Tab ===== */}
          {activeTab === "local" && (
            <div className="tab-content">
              <div className="form-group">
                <label className="form-label">Package Path</label>
                <div className="path-input-row">
                  <input
                    type="text"
                    className="search-input path-input"
                    placeholder="/path/to/local/package"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                  />
                  <button
                    className="btn btn-secondary browse-btn"
                    onClick={handleBrowse}
                  >
                    Browse...
                  </button>
                </div>
                <span className="form-hint">
                  Select a folder containing a composer.json. Uses symlink by
                  default for development.
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Package Name{" "}
                  <span className="form-optional">(optional)</span>
                </label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="vendor/package (auto-read from local composer.json)"
                  value={localPackageName}
                  onChange={(e) => setLocalPackageName(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary install-btn"
                onClick={handleLocalInstall}
                disabled={!localPath.trim()}
              >
                {options.dev
                  ? "Require --dev from Path"
                  : "Require from Path"}
              </button>
            </div>
          )}

          {/* ===== Install Options (shared across all tabs) ===== */}
          <div className="install-options">
            <div className="options-header">
              <div className="options-quick">
                <label className="option-toggle">
                  <input
                    type="checkbox"
                    checked={options.dev}
                    onChange={(e) => updateOption("dev", e.target.checked)}
                  />
                  <span>Dev dependency (--dev)</span>
                </label>
              </div>
              <button
                className="options-advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? "Hide" : "Show"} advanced options
                <span>{showAdvanced ? " \u25B2" : " \u25BC"}</span>
              </button>
            </div>

            {showAdvanced && (
              <div className="options-advanced">
                <div className="form-group">
                  <label className="form-label">
                    Version Constraint{" "}
                    <span className="form-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="search-input version-input"
                    placeholder="e.g. ^1.0, ~2.3, dev-main, >=1.0 <3.0"
                    value={options.version || ""}
                    onChange={(e) => updateOption("version", e.target.value)}
                  />
                </div>

                <div className="options-grid">
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.preferSource || false}
                      onChange={(e) =>
                        updateOption("preferSource", e.target.checked)
                      }
                    />
                    <span>--prefer-source</span>
                  </label>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.preferDist || false}
                      onChange={(e) =>
                        updateOption("preferDist", e.target.checked)
                      }
                    />
                    <span>--prefer-dist</span>
                  </label>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.sortPackages || false}
                      onChange={(e) =>
                        updateOption("sortPackages", e.target.checked)
                      }
                    />
                    <span>--sort-packages</span>
                  </label>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.withDependencies || false}
                      onChange={(e) =>
                        updateOption("withDependencies", e.target.checked)
                      }
                    />
                    <span>--with-all-dependencies</span>
                  </label>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.noUpdate || false}
                      onChange={(e) =>
                        updateOption("noUpdate", e.target.checked)
                      }
                    />
                    <span>--no-update</span>
                  </label>
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={options.noInstall || false}
                      onChange={(e) =>
                        updateOption("noInstall", e.target.checked)
                      }
                    />
                    <span>--no-install</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchPanel;
