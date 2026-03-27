import { useState, useEffect, useCallback } from "react";
import { ComposerPackage, ComposerScript, PackagistSearchResult, ColumnConfig, MessageToWebview } from "./types";
import { postMessage } from "./hooks/useVsCodeApi";
import DependencyTable from "./components/DependencyTable";
import SearchPanel from "./components/SearchPanel";
import ScriptsPanel from "./components/ScriptsPanel";
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
    type: true,
    lastUpdate: true,
    security: true,
    semverUpdate: true,
    phpVersion: false,
  });
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

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

    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const msg = event.data;
      switch (msg.type) {
        case "packages":
          setPackages(msg.data);
          break;
        case "searchResults":
          setSearchResults(msg.data);
          break;
        case "loading":
          setLoading(msg.loading);
          break;
        case "error":
          showNotification(msg.message, "error");
          break;
        case "config":
          setColumnConfig(msg.data);
          break;
        case "scripts":
          setScripts(msg.data);
          break;
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
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "version":
          cmp = a.currentVersion.localeCompare(b.currentVersion);
          break;
        case "latest":
          cmp = a.latestVersion.localeCompare(b.latestVersion);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

  const outdatedCount = packages.filter(
    (p) => p.updateType !== "none" && !p.isIgnored
  ).length;

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleUpdate = (pkg: ComposerPackage) => {
    setModal({
      visible: true,
      title: "Update Package",
      message: `Update ${pkg.name} from ${pkg.currentVersion} to ${pkg.latestVersion}?`,
      confirmLabel: "Update",
      type: "info",
      onConfirm: () => {
        setModal((m) => ({ ...m, visible: false }));
        postMessage({ type: "update", packageName: pkg.name });
      },
    });
  };

  const handleUninstall = (pkg: ComposerPackage) => {
    setModal({
      visible: true,
      title: "Uninstall Package",
      message: `Are you sure you want to remove ${pkg.name}?`,
      confirmLabel: "Uninstall",
      type: "danger",
      onConfirm: () => {
        setModal((m) => ({ ...m, visible: false }));
        postMessage({ type: "uninstall", packageName: pkg.name });
      },
    });
  };

  const handleUpdateAll = () => {
    const outdated = packages.filter((p) => p.updateType !== "none" && !p.isIgnored);
    const preview = outdated.slice(0, 10).map((p) => `${p.name}: ${p.currentVersion} -> ${p.latestVersion}`).join("\n");
    const extra = outdated.length > 10 ? `\n...and ${outdated.length - 10} more` : "";

    setModal({
      visible: true,
      title: "Update All Packages",
      message: `Update ${outdated.length} packages?\n\n${preview}${extra}`,
      confirmLabel: "Update All",
      type: "warning",
      onConfirm: () => {
        setModal((m) => ({ ...m, visible: false }));
        postMessage({ type: "updateAll" });
      },
    });
  };

  const handleIgnore = (pkg: ComposerPackage) => {
    if (pkg.isIgnored) {
      postMessage({ type: "unignore", packageName: pkg.name });
    } else {
      postMessage({ type: "ignore", packageName: pkg.name });
    }
  };

  const handleRefresh = () => {
    postMessage({ type: "refresh" });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Composer Visual Manager</h1>
        <div className="header-actions">
          {outdatedCount > 0 && (
            <span className="badge">{outdatedCount} update{outdatedCount !== 1 ? "s" : ""} available</span>
          )}
          {outdatedCount > 0 && (
            <button className="btn btn-primary" onClick={handleUpdateAll}>
              Update All
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleRefresh} title="Refresh">
            &#x21BB;
          </button>
        </div>
      </header>

      <SearchPanel
        searchResults={searchResults}
        installedPackages={packages}
      />

      <ScriptsPanel scripts={scripts} />

      <FilterBar
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={packages.length}
        filteredCount={filteredPackages.length}
      />

      <DependencyTable
        packages={filteredPackages}
        loading={loading}
        columnConfig={columnConfig}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onUpdate={handleUpdate}
        onUninstall={handleUninstall}
        onIgnore={handleIgnore}
      />

      {modal.visible && (
        <Modal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          type={modal.type}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal((m) => ({ ...m, visible: false }))}
        />
      )}

      {notification.visible && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

export default App;
