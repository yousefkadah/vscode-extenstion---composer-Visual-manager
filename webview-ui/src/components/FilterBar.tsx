interface Props {
  filterType: "all" | "require" | "require-dev";
  onFilterTypeChange: (type: "all" | "require" | "require-dev") => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  viewMode: "all" | "outdated";
  onViewModeChange: (mode: "all" | "outdated") => void;
  totalCount: number;
  filteredCount: number;
}

function FilterBar({
  filterType,
  onFilterTypeChange,
  searchText,
  onSearchTextChange,
  viewMode,
  onViewModeChange,
  totalCount,
  filteredCount,
}: Props) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-left">
        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => onFilterTypeChange(e.target.value as any)}
        >
          <option value="all">All Dependencies</option>
          <option value="require">Production</option>
          <option value="require-dev">Development</option>
        </select>

        <input
          type="text"
          className="filter-search"
          placeholder="Filter packages..."
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
        />
      </div>

      <div className="filter-bar-right">
        <label className="view-toggle">
          <input
            type="checkbox"
            checked={viewMode === "outdated"}
            onChange={(e) =>
              onViewModeChange(e.target.checked ? "outdated" : "all")
            }
          />
          <span>Show only outdated</span>
        </label>
        <span className="filter-count">
          {filteredCount} of {totalCount} packages
        </span>
      </div>
    </div>
  );
}

export default FilterBar;
