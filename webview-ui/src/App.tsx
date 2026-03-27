import { useState, useEffect, useCallback } from "react";
import {
  ComposerPackage, ComposerScript, PackagistSearchResult, ColumnConfig,
  AutoloadData, PlatformRequirement, HealthCheck, FrameworkInfo,
  LicenseEntry, StabilityConfig, WhyResult, ComposerRepository,
  SuggestEntry, LaravelExtra, MessageToWebview,
} from "./types";
import { postMessage } from "./hooks/useVsCodeApi";
import DependencyTable from "./components/DependencyTable";
import SearchPanel from "./components/SearchPanel";
import ScriptsPanel from "./components/ScriptsPanel";
import AutoloadPanel from "./components/AutoloadPanel";
import PlatformPanel from "./components/PlatformPanel";
import HealthPanel from "./components/HealthPanel";
import FrameworkPanel from "./components/FrameworkPanel";
import LicensesPanel from "./components/LicensesPanel";
import RepositoriesPanel from "./components/RepositoriesPanel";
import SuggestsPanel from "./components/SuggestsPanel";
import LaravelExtraPanel from "./components/LaravelExtraPanel";
import FilterBar from "./components/FilterBar";
import Modal from "./components/Modal";

type FilterType = "all" | "require" | "require-dev";
type ViewMode = "all" | "outdated";

function App() {
  const [packages, setPackages] = useState<ComposerPackage[]>([]);
  const [scripts, setScripts] = useState<ComposerScript[]>([]);
  const [searchResults, setSearchResults] = useState<PackagistSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({
    type: true, lastUpdate: true, security: true, semverUpdate: true, phpVersion: false,
  });
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // New panel states
  const [autoloadData, setAutoloadData] = useState<AutoloadData | null>(null);
  const [platformReqs, setPlatformReqs] = useState<PlatformRequirement[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [frameworkInfo, setFrameworkInfo] = useState<FrameworkInfo | null>(null);
  const [licenses, setLicenses] = useState<LicenseEntry[]>([]);
  const [stability, setStability] = useState<StabilityConfig | null>(null);
  const [whyResults, setWhyResults] = useState<WhyResult[]>([]);
  const [whyModal, setWhyModal] = useState(false);
  const [repositories, setRepositories] = useState<ComposerRepository[]>([]);
  const [suggests, setSuggests] = useState<SuggestEntry[]>([]);
  const [laravelExtra, setLaravelExtra] = useState<LaravelExtra | null>(null);

  // Modal state
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    type?: "danger" | "warning" | "info";
  }>({ visible: false, title: "", message: "", onConfirm: () => {} });

  // Notification state
  const [notification, setNotification] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  useEffect(() => {
    postMessage({ type: "requestConfig" });
    postMessage({ type: "requestPackages" });
    postMessage({ type: "requestScripts" });
    postMessage({ type: "requestFrameworkInfo" });
    postMessage({ type: "requestStability" });

    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      switch (msg.type) {
        case "packages": setPackages(msg.data); break;
        case "searchResults": setSearchResults(msg.data); break;
        case "loading": setLoading(msg.loading); break;
        case "error": showNotification(msg.message, "error"); break;
        case "config": setColumnConfig(msg.data); break;
        case "scripts": setScripts(msg.data); break;
        case "autoloadData": setAutoloadData(msg.data); break;
        case "platformRequirements": setPlatformReqs(msg.data); break;
        case "healthChecks": setHealthChecks(msg.data); break;
        case "frameworkInfo": setFrameworkInfo(msg.data); break;
        case "licenses": setLicenses(msg.data); break;
        case "stabilityConfig": setStability(msg.data); break;
        case "whyResult":
          setWhyResults(msg.data);
          setWhyModal(true);
          break;
        case "repositories": setRepositories(msg.data); break;
        case "suggests": setSuggests(msg.data); break;
        case "laravelExtra": setLaravelExtra(msg.data); break;
        case "operationComplete":
          showNotification(msg.message, msg.success ? "success" : "error");
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const showNotification = useCallback((message: string, type: "success" | "error") => {
    setNotification({ visible: true, message, type });
    setTimeout(() => setNotification((n) => ({ ...n, visible: false })), 4000);
  }, []);

  const filteredPackages = packages
    .filter((pkg) => {
      if (filterType !== "all" && pkg.type !== filterType) return false;
      if (searchText && !pkg.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (viewMode === "outdated" && pkg.updateType === "none") return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "version": cmp = a.currentVersion.localeCompare(b.currentVersion); break;
        case "latest": cmp = a.latestVersion.localeCompare(b.latestVersion); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        default: cmp = a.name.localeCompare(b.name);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

  const outdatedCount = packages.filter((p) => p.updateType !== "none" && !p.isIgnored).length;

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortColumn(column); setSortDirection("asc"); }
  };

  const handleUpdate = (pkg: ComposerPackage) => {
    setModal({ visible: true, title: "Update Package", message: `Update ${pkg.name} from ${pkg.currentVersion} to ${pkg.latestVersion}?`, confirmLabel: "Update", type: "info",
      onConfirm: () => { setModal((m) => ({ ...m, visible: false })); postMessage({ type: "update", packageName: pkg.name }); },
    });
  };

  const handleUninstall = (pkg: ComposerPackage) => {
    setModal({ visible: true, title: "Uninstall Package", message: `Are you sure you want to remove ${pkg.name}?`, confirmLabel: "Uninstall", type: "danger",
      onConfirm: () => { setModal((m) => ({ ...m, visible: false })); postMessage({ type: "uninstall", packageName: pkg.name }); },
    });
  };

  const handleUpdateAll = () => {
    const outdated = packages.filter((p) => p.updateType !== "none" && !p.isIgnored);
    const preview = outdated.slice(0, 10).map((p) => `${p.name}: ${p.currentVersion} -> ${p.latestVersion}`).join("\n");
    const extra = outdated.length > 10 ? `\n...and ${outdated.length - 10} more` : "";
    setModal({ visible: true, title: "Update All Packages", message: `Update ${outdated.length} packages?\n\n${preview}${extra}`, confirmLabel: "Update All", type: "warning",
      onConfirm: () => { setModal((m) => ({ ...m, visible: false })); postMessage({ type: "updateAll" }); },
    });
  };

  const handleIgnore = (pkg: ComposerPackage) => {
    if (pkg.isIgnored) postMessage({ type: "unignore", packageName: pkg.name });
    else postMessage({ type: "ignore", packageName: pkg.name });
  };

  const handleWhy = (pkg: ComposerPackage) => {
    postMessage({ type: "why", packageName: pkg.name });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Composer Visual Manager</h1>
        <div className="header-actions">
          {stability && (
            <div className="stability-controls">
              <select className="filter-select" value={stability.minimumStability}
                onChange={(e) => postMessage({ type: "setStability", minimumStability: e.target.value, preferStable: stability.preferStable })}>
                <option value="stable">stable</option>
                <option value="RC">RC</option>
                <option value="beta">beta</option>
                <option value="alpha">alpha</option>
                <option value="dev">dev</option>
              </select>
              <label className="option-toggle">
                <input type="checkbox" checked={stability.preferStable}
                  onChange={(e) => postMessage({ type: "setStability", minimumStability: stability.minimumStability, preferStable: e.target.checked })} />
                <span>prefer-stable</span>
              </label>
            </div>
          )}
          {outdatedCount > 0 && (
            <span className="badge">{outdatedCount} update{outdatedCount !== 1 ? "s" : ""}</span>
          )}
          {outdatedCount > 0 && (
            <button className="btn btn-primary" onClick={handleUpdateAll}>Update All</button>
          )}
          <button className="btn btn-secondary" onClick={() => postMessage({ type: "refresh" })} title="Refresh">&#x21BB;</button>
        </div>
      </header>

      {/* Framework Detection */}
      <FrameworkPanel frameworkInfo={frameworkInfo} />

      <SearchPanel searchResults={searchResults} installedPackages={packages} />
      <ScriptsPanel scripts={scripts} />
      <AutoloadPanel autoloadData={autoloadData} />
      <PlatformPanel requirements={platformReqs} />
      <HealthPanel checks={healthChecks} />
      <LicensesPanel licenses={licenses} />
      <RepositoriesPanel repositories={repositories} />
      <SuggestsPanel suggests={suggests} />
      <LaravelExtraPanel laravelExtra={laravelExtra} frameworkInfo={frameworkInfo} />

      {/* Bump button */}
      <div className="bump-section">
        <button className="btn btn-secondary btn-sm" onClick={() => postMessage({ type: "bump", dryRun: true })} title="Preview constraint bumps">
          Bump (Dry Run)
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => postMessage({ type: "bump", dryRun: false })} title="Raise lower bounds to installed versions">
          Bump Constraints
        </button>
        <span className="form-hint" style={{ marginLeft: 4 }}>Raise version lower bounds to installed versions</span>
      </div>

      <FilterBar
        filterType={filterType} onFilterTypeChange={setFilterType}
        searchText={searchText} onSearchTextChange={setSearchText}
        viewMode={viewMode} onViewModeChange={setViewMode}
        totalCount={packages.length} filteredCount={filteredPackages.length}
      />

      <DependencyTable
        packages={filteredPackages} loading={loading} columnConfig={columnConfig}
        sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort}
        onUpdate={handleUpdate} onUninstall={handleUninstall} onIgnore={handleIgnore}
        onWhy={handleWhy}
      />

      {/* Why Modal */}
      {whyModal && whyResults.length > 0 && (
        <Modal
          title={`Why is ${whyResults[0]?.packageName} installed?`}
          message={whyResults.map((r) => r.reason).join("\n")}
          confirmLabel="Close"
          type="info"
          onConfirm={() => setWhyModal(false)}
          onCancel={() => setWhyModal(false)}
        />
      )}

      {modal.visible && (
        <Modal title={modal.title} message={modal.message} confirmLabel={modal.confirmLabel}
          type={modal.type} onConfirm={modal.onConfirm} onCancel={() => setModal((m) => ({ ...m, visible: false }))} />
      )}

      {notification.visible && (
        <div className={`notification ${notification.type}`}>{notification.message}</div>
      )}
    </div>
  );
}

export default App;
