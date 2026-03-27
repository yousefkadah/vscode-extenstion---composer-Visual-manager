import { ComposerPackage, ColumnConfig } from "../types";
import SemverBadge from "./SemverBadge";
import { postMessage } from "../hooks/useVsCodeApi";

interface Props {
  packages: ComposerPackage[];
  loading: boolean;
  columnConfig: ColumnConfig;
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  onUpdate: (pkg: ComposerPackage) => void;
  onUninstall: (pkg: ComposerPackage) => void;
  onIgnore: (pkg: ComposerPackage) => void;
  onWhy?: (pkg: ComposerPackage) => void;
}

function DependencyTable({
  packages,
  loading,
  columnConfig,
  sortColumn,
  sortDirection,
  onSort,
  onUpdate,
  onUninstall,
  onIgnore,
  onWhy,
}: Props) {
  if (loading && packages.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading packages...</p>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="empty-state">
        <p>No packages found.</p>
      </div>
    );
  }

  const sortIcon = (column: string) => {
    if (sortColumn !== column) return " \u2195";
    return sortDirection === "asc" ? " \u2191" : " \u2193";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  };

  const openPackagist = (name: string) => {
    postMessage({
      type: "openExternal",
      url: `https://packagist.org/packages/${name}`,
    });
  };

  return (
    <div className="table-wrapper">
      {loading && <div className="table-loading-bar" />}
      <table className="dep-table">
        <thead>
          <tr>
            <th className="col-name sortable" onClick={() => onSort("name")}>
              Package{sortIcon("name")}
            </th>
            <th className="col-version sortable" onClick={() => onSort("version")}>
              Installed{sortIcon("version")}
            </th>
            <th className="col-latest sortable" onClick={() => onSort("latest")}>
              Latest{sortIcon("latest")}
            </th>
            {columnConfig.semverUpdate && <th className="col-update-type">Update</th>}
            {columnConfig.type && (
              <th className="col-type sortable" onClick={() => onSort("type")}>
                Type{sortIcon("type")}
              </th>
            )}
            {columnConfig.lastUpdate && <th className="col-date">Last Updated</th>}
            {columnConfig.security && <th className="col-security">Security</th>}
            {columnConfig.phpVersion && <th className="col-php">PHP</th>}
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.name} className={pkg.isIgnored ? "row-ignored" : ""}>
              <td className="col-name">
                <div className="package-name-cell">
                  {pkg.hasSecurityIssue && (
                    <span className="icon-security" title={pkg.securityAdvisory || "Security issue"}>
                      &#x1F6E1;
                    </span>
                  )}
                  {pkg.isDeprecated && (
                    <span className="icon-deprecated" title={pkg.deprecationMessage || "Deprecated"}>
                      &#x26A0;
                    </span>
                  )}
                  <span
                    className="package-name-link"
                    onClick={() => openPackagist(pkg.name)}
                    title={pkg.description}
                  >
                    {pkg.name}
                  </span>
                </div>
              </td>
              <td className="col-version">
                <span className="version-text">
                  {pkg.currentVersion}
                  {pkg.installedVersion &&
                    pkg.installedVersion !== pkg.currentVersion && (
                      <span className="version-mismatch" title={`Installed: ${pkg.installedVersion}`}>
                        *
                      </span>
                    )}
                </span>
              </td>
              <td className="col-latest">{pkg.latestVersion}</td>
              {columnConfig.semverUpdate && (
                <td className="col-update-type">
                  {pkg.updateType !== "none" && <SemverBadge type={pkg.updateType} />}
                </td>
              )}
              {columnConfig.type && (
                <td className="col-type">
                  <span className={`type-badge type-${pkg.type}`}>
                    {pkg.type === "require" ? "prod" : "dev"}
                  </span>
                </td>
              )}
              {columnConfig.lastUpdate && (
                <td className="col-date">{formatDate(pkg.lastUpdateDate)}</td>
              )}
              {columnConfig.security && (
                <td className="col-security">
                  {pkg.hasSecurityIssue ? (
                    <span className="security-issue" title={pkg.securityAdvisory}>
                      &#x1F6E1; Vulnerable
                    </span>
                  ) : (
                    <span className="security-ok" title="No known vulnerabilities">
                      &#x2714;
                    </span>
                  )}
                </td>
              )}
              {columnConfig.phpVersion && (
                <td className="col-php">{pkg.phpVersionRequired || "-"}</td>
              )}
              <td className="col-actions">
                <div className="action-buttons">
                  {pkg.updateType !== "none" && !pkg.isIgnored && (
                    <button
                      className="action-btn action-update"
                      title={`Update to ${pkg.latestVersion}`}
                      onClick={() => onUpdate(pkg)}
                    >
                      &#x2B06;
                    </button>
                  )}
                  <button
                    className="action-btn action-ignore"
                    title={pkg.isIgnored ? "Unignore package" : "Ignore package"}
                    onClick={() => onIgnore(pkg)}
                  >
                    {pkg.isIgnored ? "\u{1F441}" : "\u{1F648}"}
                  </button>
                  {onWhy && (
                    <button
                      className="action-btn"
                      title="Why is this installed?"
                      onClick={() => onWhy(pkg)}
                    >
                      &#x2753;
                    </button>
                  )}
                  <button
                    className="action-btn action-changelog"
                    title="View on Packagist"
                    onClick={() => openPackagist(pkg.name)}
                  >
                    &#x1F4D6;
                  </button>
                  <button
                    className="action-btn action-uninstall"
                    title="Uninstall"
                    onClick={() => onUninstall(pkg)}
                  >
                    &#x1F5D1;
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DependencyTable;
