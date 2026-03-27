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

export interface PackagistPackageInfo {
  name: string;
  description: string;
  versions: Record<string, PackagistVersionInfo>;
}

export interface PackagistVersionInfo {
  version: string;
  version_normalized: string;
  time?: string;
  require?: Record<string, string>;
}

export interface SecurityAdvisory {
  advisoryId: string;
  packageName: string;
  title: string;
  affectedVersions: string;
  cve?: string;
}

export type MessageToWebview =
  | { type: "packages"; data: ComposerPackage[] }
  | { type: "searchResults"; data: PackagistSearchResult[] }
  | { type: "operationComplete"; operation: string; success: boolean; message: string }
  | { type: "loading"; loading: boolean }
  | { type: "error"; message: string }
  | { type: "config"; data: ColumnConfig }
  | { type: "projectInfo"; data: ProjectInfo }
  | { type: "localPathSelected"; path: string }
  | { type: "githubPackageInfo"; name: string; description: string; branches: string[] };

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
  | { type: "requestConfig" };

export interface ColumnConfig {
  type: boolean;
  lastUpdate: boolean;
  security: boolean;
  semverUpdate: boolean;
  phpVersion: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  composerJsonPath: string;
}
