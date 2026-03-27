export interface ComposerPackage {
  name: string;
  currentVersion: string;
  latestVersion: string;
  constraint: string;
  description: string;
  type: "require" | "require-dev";
  updateType: "major" | "minor" | "patch" | "none";
  isDeprecated: boolean;
  deprecationMessage?: string;
  hasSecurityIssue: boolean;
  securityAdvisory?: string;
  lastUpdateDate?: string;
  phpVersionRequired?: string;
  installedVersion?: string;
  isIgnored: boolean;
}

export interface PackagistSearchResult {
  name: string;
  description: string;
  url: string;
  downloads: number;
  favers: number;
}

export interface ColumnConfig {
  type: boolean;
  lastUpdate: boolean;
  security: boolean;
  semverUpdate: boolean;
  phpVersion: boolean;
}

export type MessageToWebview =
  | { type: "packages"; data: ComposerPackage[] }
  | { type: "searchResults"; data: PackagistSearchResult[] }
  | { type: "operationComplete"; operation: string; success: boolean; message: string }
  | { type: "loading"; loading: boolean }
  | { type: "error"; message: string }
  | { type: "config"; data: ColumnConfig };

export type MessageFromWebview =
  | { type: "requestPackages" }
  | { type: "search"; query: string }
  | { type: "install"; packageName: string; dev: boolean }
  | { type: "uninstall"; packageName: string }
  | { type: "update"; packageName: string }
  | { type: "updateAll" }
  | { type: "rollback"; packageName: string; version: string }
  | { type: "ignore"; packageName: string; reason?: string }
  | { type: "unignore"; packageName: string }
  | { type: "refresh" }
  | { type: "openExternal"; url: string }
  | { type: "requestConfig" };

declare global {
  function acquireVsCodeApi(): {
    postMessage(message: MessageFromWebview): void;
    getState(): any;
    setState(state: any): void;
  };
}
