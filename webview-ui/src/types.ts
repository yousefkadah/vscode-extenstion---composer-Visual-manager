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

export interface ComposerScript {
  name: string;
  command: string | string[];
}

export interface ScriptSuggestion {
  tool: string;
  description: string;
  package: string;
  dev: boolean;
  scripts: { name: string; command: string }[];
}

export interface ColumnConfig {
  type: boolean;
  lastUpdate: boolean;
  security: boolean;
  semverUpdate: boolean;
  phpVersion: boolean;
}

export interface InstallOptions {
  dev: boolean;
  version?: string;
  preferSource?: boolean;
  preferDist?: boolean;
  sortPackages?: boolean;
  noUpdate?: boolean;
  noInstall?: boolean;
  withDependencies?: boolean;
}

export type InstallSource = "packagist" | "github" | "local";

export type MessageToWebview =
  | { type: "packages"; data: ComposerPackage[] }
  | { type: "searchResults"; data: PackagistSearchResult[] }
  | { type: "operationComplete"; operation: string; success: boolean; message: string }
  | { type: "loading"; loading: boolean }
  | { type: "error"; message: string }
  | { type: "config"; data: ColumnConfig }
  | { type: "localPathSelected"; path: string }
  | { type: "githubPackageInfo"; name: string; description: string; branches: string[] }
  | { type: "scripts"; data: ComposerScript[] }
  | { type: "scriptOutput"; output: string };

export type MessageFromWebview =
  | { type: "requestPackages" }
  | { type: "search"; query: string }
  | { type: "install"; packageName: string; options: InstallOptions }
  | { type: "installFromGithub"; url: string; packageName?: string; options: InstallOptions }
  | { type: "installFromPath"; path: string; packageName?: string; options: InstallOptions }
  | { type: "browseLocalPath" }
  | { type: "uninstall"; packageName: string }
  | { type: "update"; packageName: string }
  | { type: "updateAll" }
  | { type: "rollback"; packageName: string; version: string }
  | { type: "ignore"; packageName: string; reason?: string }
  | { type: "unignore"; packageName: string }
  | { type: "refresh" }
  | { type: "openExternal"; url: string }
  | { type: "requestConfig" }
  | { type: "requestScripts" }
  | { type: "addScript"; name: string; command: string }
  | { type: "removeScript"; name: string }
  | { type: "editScript"; name: string; command: string }
  | { type: "runScript"; name: string }
  | { type: "addSuggestion"; tool: string };

declare global {
  function acquireVsCodeApi(): {
    postMessage(message: MessageFromWebview): void;
    getState(): any;
    setState(state: any): void;
  };
}
