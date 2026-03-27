import { useState, useRef, useCallback } from "react";
import { PackagistSearchResult, ComposerPackage } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  searchResults: PackagistSearchResult[];
  installedPackages: ComposerPackage[];
}

function SearchPanel({ searchResults, installedPackages }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

  const handleInstall = (name: string, dev: boolean) => {
    postMessage({ type: "install", packageName: name, dev });
    setQuery("");
  };

  const handleUninstall = (name: string) => {
    postMessage({ type: "uninstall", packageName: name });
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
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">Install Packages</span>
      </div>
      {expanded && (
        <div className="search-panel-body">
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
                      <div className="search-result-name">{result.name}</div>
                      <div className="search-result-desc">
                        {result.description}
                      </div>
                      <div className="search-result-meta">
                        <span>&#x2B07; {formatDownloads(result.downloads)}</span>
                        <span>&#x2B50; {result.favers}</span>
                      </div>
                    </div>
                    <div className="search-result-actions">
                      {installed ? (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleUninstall(result.name)}
                        >
                          Uninstall
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleInstall(result.name, false)}
                          >
                            Require
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleInstall(result.name, true)}
                          >
                            Require --dev
                          </button>
                        </>
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
    </div>
  );
}

export default SearchPanel;
