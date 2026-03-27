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

// Autoload
export interface AutoloadEntry {
  namespace: string;
  path: string;
}

export interface AutoloadConfig {
  psr4: AutoloadEntry[];
  psr0: AutoloadEntry[];
  classmap: string[];
  files: string[];
}

export interface AutoloadData {
  autoload: AutoloadConfig;
  autoloadDev: AutoloadConfig;
}

// Platform
export interface PlatformRequirement {
  name: string;
  constraint: string;
  type: "php" | "extension";
  installed?: string;
  status?: "ok" | "missing" | "mismatch";
}

// Health
export interface HealthCheck {
  label: string;
  status: "ok" | "warning" | "error";
  message: string;
}

// Framework
export type FrameworkType = "laravel" | "symfony" | "wordpress" | "yii" | "cakephp" | "codeigniter" | "slim" | "none";

export interface FrameworkInfo {
  type: FrameworkType;
  version?: string;
  commands: FrameworkCommand[];
  quickActions: FrameworkQuickAction[];
}

export interface FrameworkCommand {
  name: string;
  command: string;
  description: string;
  category: string;
}

export interface FrameworkQuickAction {
  label: string;
  command: string;
  description: string;
  icon: string;
}

// Repositories
export interface ComposerRepository {
  type: string;
  url?: string;
  path?: string;
  options?: Record<string, any>;
  raw: any;
  index: number;
}

// Suggests
export interface SuggestEntry {
  name: string;
  reason: string;
  installed: boolean;
}

// Laravel Extra
export interface LaravelExtra {
  dontDiscover: string[];
  providers: string[];
  aliases: Record<string, string>;
}

// Licenses
export interface LicenseEntry {
  name: string;
  version: string;
  license: string[];
}

// Stability
export interface StabilityConfig {
  minimumStability: string;
  preferStable: boolean;
}

// Why
export interface WhyResult {
  packageName: string;
  reason: string;
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
  | { type: "githubPackageInfo"; name: string; description: string; branches: string[] }
  | { type: "scripts"; data: ComposerScript[] }
  | { type: "scriptOutput"; output: string }
  | { type: "autoloadData"; data: AutoloadData }
  | { type: "platformRequirements"; data: PlatformRequirement[] }
  | { type: "healthChecks"; data: HealthCheck[] }
  | { type: "frameworkInfo"; data: FrameworkInfo }
  | { type: "licenses"; data: LicenseEntry[] }
  | { type: "stabilityConfig"; data: StabilityConfig }
  | { type: "whyResult"; data: WhyResult[] }
  | { type: "commandOutput"; title: string; output: string }
  | { type: "repositories"; data: ComposerRepository[] }
  | { type: "suggests"; data: SuggestEntry[] }
  | { type: "laravelExtra"; data: LaravelExtra };

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
  | { type: "requestConfig" }
  | { type: "requestScripts" }
  | { type: "addScript"; name: string; command: string }
  | { type: "removeScript"; name: string }
  | { type: "editScript"; name: string; command: string }
  | { type: "runScript"; name: string }
  | { type: "addSuggestion"; tool: string }
  // Autoload
  | { type: "requestAutoload" }
  | { type: "addAutoloadEntry"; section: "autoload" | "autoload-dev"; entryType: "psr-4" | "classmap" | "files"; namespace?: string; path: string }
  | { type: "removeAutoloadEntry"; section: "autoload" | "autoload-dev"; entryType: "psr-4" | "classmap" | "files"; namespace?: string; path: string }
  | { type: "dumpAutoload"; optimize: "none" | "classmap" | "authoritative" | "apcu" }
  // Platform
  | { type: "requestPlatform" }
  | { type: "addPlatformReq"; name: string; constraint: string }
  | { type: "removePlatformReq"; name: string }
  | { type: "checkPlatformReqs" }
  // Health
  | { type: "runValidate" }
  | { type: "runDiagnose" }
  // Framework
  | { type: "requestFrameworkInfo" }
  | { type: "runFrameworkCommand"; command: string }
  // Licenses
  | { type: "requestLicenses" }
  // Stability
  | { type: "requestStability" }
  | { type: "setStability"; minimumStability: string; preferStable: boolean }
  // Why
  | { type: "why"; packageName: string }
  | { type: "whyNot"; packageName: string; version: string }
  // Repositories
  | { type: "requestRepositories" }
  | { type: "addRepository"; repoType: string; url: string }
  | { type: "removeRepository"; index: number }
  // Suggests
  | { type: "requestSuggests" }
  | { type: "installSuggested"; packageName: string }
  // Bump
  | { type: "bump"; dryRun: boolean }
  // Laravel Extra
  | { type: "requestLaravelExtra" }
  | { type: "addDontDiscover"; packageName: string }
  | { type: "removeDontDiscover"; packageName: string }
  | { type: "addLaravelProvider"; provider: string }
  | { type: "removeLaravelProvider"; provider: string }
  | { type: "addLaravelAlias"; alias: string; className: string }
  | { type: "removeLaravelAlias"; alias: string };

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
