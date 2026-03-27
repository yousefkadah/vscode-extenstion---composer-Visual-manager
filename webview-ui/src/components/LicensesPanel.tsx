import { useState, useEffect } from "react";
import { LicenseEntry } from "../types";
import { postMessage } from "../hooks/useVsCodeApi";

const RESTRICTIVE_LICENSES = ["GPL", "GPL-2.0", "GPL-3.0", "AGPL", "AGPL-3.0", "SSPL", "EUPL"];

interface Props {
  licenses: LicenseEntry[];
}

function LicensesPanel({ licenses }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filterLicense, setFilterLicense] = useState<string>("all");

  useEffect(() => {
    if (expanded && licenses.length === 0) postMessage({ type: "requestLicenses" });
  }, [expanded]);

  const allLicenseTypes = [...new Set(licenses.flatMap((l) => l.license))].sort();

  const grouped: Record<string, LicenseEntry[]> = {};
  for (const entry of licenses) {
    const key = entry.license.join(", ") || "Unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  const isRestrictive = (lic: string[]) =>
    lic.some((l) => RESTRICTIVE_LICENSES.some((r) => l.toUpperCase().includes(r)));

  const filtered = filterLicense === "all"
    ? licenses
    : licenses.filter((l) => l.license.includes(filterLicense));

  const restrictiveCount = licenses.filter((l) => isRestrictive(l.license)).length;

  return (
    <div className="panel-section">
      <div className="search-panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="search-panel-toggle">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="search-panel-title">
          Licenses
          {licenses.length > 0 && <span className="scripts-count">{licenses.length}</span>}
          {restrictiveCount > 0 && <span className="license-warn-badge">{restrictiveCount} restrictive</span>}
        </span>
      </div>
      {expanded && (
        <div className="panel-body">
          <div className="panel-actions-row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--vscode-panel-border, #333)" }}>
            <button className="btn btn-primary btn-sm" onClick={() => postMessage({ type: "requestLicenses" })}>
              Refresh Licenses
            </button>
            <select
              className="filter-select"
              value={filterLicense}
              onChange={(e) => setFilterLicense(e.target.value)}
            >
              <option value="all">All Licenses ({licenses.length})</option>
              {allLicenseTypes.map((lt) => (
                <option key={lt} value={lt}>{lt} ({licenses.filter((l) => l.license.includes(lt)).length})</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          {licenses.length > 0 && filterLicense === "all" && (
            <div className="license-summary">
              {Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).map(([lic, entries]) => (
                <div
                  key={lic}
                  className={`license-summary-item ${isRestrictive(lic.split(", ")) ? "license-restrictive" : ""}`}
                  onClick={() => setFilterLicense(lic.includes(",") ? "all" : lic)}
                >
                  <span className="license-type">{lic}</span>
                  <span className="license-count">{entries.length}</span>
                </div>
              ))}
            </div>
          )}

          <div className="panel-content" style={{ maxHeight: 300, overflow: "auto" }}>
            {filtered.length === 0 && <div className="scripts-empty">No license data. Click "Refresh Licenses".</div>}
            {filtered.map((entry) => (
              <div key={entry.name} className={`script-row ${isRestrictive(entry.license) ? "license-row-warn" : ""}`}>
                <div className="script-info">
                  <span className="script-name">{entry.name}</span>
                  <span className="script-command">{entry.version}</span>
                </div>
                <div className="license-badges">
                  {entry.license.map((l) => (
                    <span key={l} className={`license-badge ${isRestrictive([l]) ? "license-badge-warn" : ""}`}>{l}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LicensesPanel;
