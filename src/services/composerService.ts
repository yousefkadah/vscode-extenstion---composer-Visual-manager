import * as vscode from "vscode";
import * as path from "path";
import {
  ComposerPackage, SecurityAdvisory, InstallOptions, ComposerScript, ScriptSuggestion,
  AutoloadData, AutoloadConfig, PlatformRequirement, HealthCheck,
  FrameworkInfo, FrameworkType, LicenseEntry, StabilityConfig, WhyResult,
  ComposerRepository, SuggestEntry, LaravelExtra,
} from "../types";
import { runComposerCommand } from "./commandRunner";
import { getPackageInfo, getLatestStableVersion } from "./packagistApi";
import { CacheService } from "./cacheService";

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
  scripts?: Record<string, string | string[]>;
}

interface ComposerLockPackage {
  name: string;
  version: string;
  description?: string;
  time?: string;
  require?: Record<string, string>;
}

interface ComposerLock {
  packages: ComposerLockPackage[];
  "packages-dev": ComposerLockPackage[];
}

export class ComposerService {
  private composerJsonPath: string;
  private composerLockPath: string;
  private projectDir: string;

  constructor(
    composerJsonPath: string,
    private cache: CacheService
  ) {
    this.composerJsonPath = composerJsonPath;
    this.projectDir = path.dirname(composerJsonPath);
    this.composerLockPath = path.join(this.projectDir, "composer.lock");
  }

  async getPackages(forceRefresh: boolean = false): Promise<ComposerPackage[]> {
    const composerJson = await this.readComposerJson();
    if (!composerJson) {
      return [];
    }

    const composerLock = await this.readComposerLock();
    const ignoredPackages = this.getIgnoredPackages();
    const securityIssues = await this.runSecurityAudit();

    const allDeps: { name: string; constraint: string; type: "require" | "require-dev" }[] = [];

    if (composerJson.require) {
      for (const [name, constraint] of Object.entries(composerJson.require)) {
        if (name === "php" || name.startsWith("ext-")) {
          continue;
        }
        allDeps.push({ name, constraint, type: "require" });
      }
    }

    if (composerJson["require-dev"]) {
      for (const [name, constraint] of Object.entries(composerJson["require-dev"])) {
        if (name === "php" || name.startsWith("ext-")) {
          continue;
        }
        allDeps.push({ name, constraint, type: "require-dev" });
      }
    }

    const packages: ComposerPackage[] = await Promise.all(
      allDeps.map(async (dep) => {
        const lockEntry = this.findInLock(composerLock, dep.name);
        const installedVersion = lockEntry?.version?.replace(/^v/, "") || "";
        const cacheKey = `pkg:${dep.name}`;

        let latestVersion = "";
        let lastUpdateDate: string | undefined;
        let phpVersionRequired: string | undefined;

        if (!forceRefresh) {
          const cached = this.cache.get<{
            latestVersion: string;
            lastUpdateDate?: string;
            phpVersionRequired?: string;
          }>(cacheKey);
          if (cached) {
            latestVersion = cached.latestVersion;
            lastUpdateDate = cached.lastUpdateDate;
            phpVersionRequired = cached.phpVersionRequired;
          }
        }

        if (!latestVersion) {
          try {
            const info = await getPackageInfo(dep.name);
            if (info) {
              latestVersion = getLatestStableVersion(info) || installedVersion;
              const latestInfo = info.versions[latestVersion];
              lastUpdateDate = latestInfo?.time;
              phpVersionRequired = latestInfo?.require?.php;

              await this.cache.set(cacheKey, {
                latestVersion,
                lastUpdateDate,
                phpVersionRequired,
              });
            }
          } catch {
            latestVersion = installedVersion;
          }
        }

        const cleanInstalled = installedVersion.replace(/^v/, "");
        const cleanLatest = latestVersion.replace(/^v/, "");
        const updateType = this.getUpdateType(cleanInstalled, cleanLatest);
        const security = securityIssues.find(
          (s) => s.packageName.toLowerCase() === dep.name.toLowerCase()
        );
        const isIgnored = ignoredPackages.some((p) => p.name === dep.name);

        return {
          name: dep.name,
          currentVersion: cleanInstalled,
          latestVersion: cleanLatest,
          constraint: dep.constraint,
          description: lockEntry?.description || "",
          type: dep.type,
          updateType,
          isDeprecated: false,
          hasSecurityIssue: !!security,
          securityAdvisory: security?.title,
          lastUpdateDate,
          phpVersionRequired,
          installedVersion: cleanInstalled,
          isIgnored,
        };
      })
    );

    return packages;
  }

  private getUpdateType(
    current: string,
    latest: string
  ): "major" | "minor" | "patch" | "none" {
    if (!current || !latest || current === latest) {
      return "none";
    }

    const c = current.split(".").map((n) => parseInt(n, 10) || 0);
    const l = latest.split(".").map((n) => parseInt(n, 10) || 0);

    if (l[0] > c[0]) return "major";
    if (l[1] > c[1]) return "minor";
    if (l[2] > c[2]) return "patch";
    return "none";
  }

  private async readComposerJson(): Promise<ComposerJson | null> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(data).toString("utf-8"));
    } catch {
      return null;
    }
  }

  private async readComposerLock(): Promise<ComposerLock | null> {
    try {
      const uri = vscode.Uri.file(this.composerLockPath);
      const data = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(data).toString("utf-8"));
    } catch {
      return null;
    }
  }

  private findInLock(
    lock: ComposerLock | null,
    name: string
  ): ComposerLockPackage | undefined {
    if (!lock) return undefined;
    return (
      lock.packages.find((p) => p.name === name) ||
      lock["packages-dev"].find((p) => p.name === name)
    );
  }

  private async runSecurityAudit(): Promise<SecurityAdvisory[]> {
    try {
      const result = await runComposerCommand(
        "audit --format=json",
        this.projectDir,
        false
      );
      if (result.stdout) {
        const data = JSON.parse(result.stdout);
        const advisories: SecurityAdvisory[] = [];

        if (data.advisories) {
          for (const [pkgName, issues] of Object.entries<any[]>(data.advisories)) {
            for (const issue of issues) {
              advisories.push({
                advisoryId: issue.advisoryId || "",
                packageName: pkgName,
                title: issue.title || "Security vulnerability",
                affectedVersions: issue.affectedVersions || "",
                cve: issue.cve,
              });
            }
          }
        }

        return advisories;
      }
    } catch {
      // composer audit may not be available (< 2.4)
    }
    return [];
  }

  private getIgnoredPackages(): { name: string; reason?: string; pinnedVersion?: string }[] {
    const config = vscode.workspace.getConfiguration("composerVisualManager");
    return config.get<any[]>("ignoredPackages") || [];
  }

  private buildOptionFlags(options: InstallOptions): string {
    const flags: string[] = [];
    if (options.dev) flags.push("--dev");
    if (options.preferSource) flags.push("--prefer-source");
    if (options.preferDist) flags.push("--prefer-dist");
    if (options.sortPackages) flags.push("--sort-packages");
    if (options.noUpdate) flags.push("--no-update");
    if (options.noInstall) flags.push("--no-install");
    if (options.withDependencies) flags.push("--with-all-dependencies");
    return flags.join(" ");
  }

  async installPackage(packageName: string, options: InstallOptions): Promise<boolean> {
    const versionSuffix = options.version ? `:${options.version}` : "";
    const flags = this.buildOptionFlags(options);
    const result = await runComposerCommand(
      `require ${packageName}${versionSuffix} ${flags}`.trim(),
      this.projectDir
    );
    return result.exitCode === 0;
  }

  async installFromGithub(
    url: string,
    packageName: string | undefined,
    options: InstallOptions
  ): Promise<boolean> {
    // Step 1: Add the VCS repository to composer.json
    const addRepoResult = await runComposerCommand(
      `config repositories.${this.repoKeyFromUrl(url)} vcs ${url}`,
      this.projectDir
    );
    if (addRepoResult.exitCode !== 0) {
      return false;
    }

    // Step 2: If no package name given, try to detect from the repo's composer.json
    let name = packageName;
    if (!name) {
      name = this.guessPackageNameFromUrl(url);
    }
    if (!name) {
      return false;
    }

    // Step 3: Require the package
    const versionSuffix = options.version ? `:${options.version}` : "";
    const flags = this.buildOptionFlags(options);
    const result = await runComposerCommand(
      `require ${name}${versionSuffix} ${flags}`.trim(),
      this.projectDir
    );
    return result.exitCode === 0;
  }

  async installFromPath(
    localPath: string,
    packageName: string | undefined,
    options: InstallOptions
  ): Promise<boolean> {
    // Step 1: Add path repository
    const key = localPath.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    const addRepoResult = await runComposerCommand(
      `config repositories.${key} path ${localPath}`,
      this.projectDir
    );
    if (addRepoResult.exitCode !== 0) {
      return false;
    }

    // Step 2: Detect package name from local composer.json if not provided
    let name = packageName;
    if (!name) {
      try {
        const localComposerPath = path.join(localPath, "composer.json");
        const uri = vscode.Uri.file(localComposerPath);
        const data = await vscode.workspace.fs.readFile(uri);
        const json = JSON.parse(Buffer.from(data).toString("utf-8"));
        name = json.name;
      } catch {
        // Can't read local composer.json
      }
    }
    if (!name) {
      return false;
    }

    // Step 3: Require with @dev or specified version
    const versionSuffix = options.version ? `:${options.version}` : ":@dev";
    const flags = this.buildOptionFlags(options);
    const result = await runComposerCommand(
      `require ${name}${versionSuffix} ${flags}`.trim(),
      this.projectDir
    );
    return result.exitCode === 0;
  }

  private repoKeyFromUrl(url: string): string {
    return url
      .replace(/^https?:\/\//, "")
      .replace(/\.git$/, "")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-");
  }

  private guessPackageNameFromUrl(url: string): string | undefined {
    // Try to extract vendor/package from GitHub URL
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      return `${match[1]}/${match[2]}`.toLowerCase();
    }
    return undefined;
  }

  async uninstallPackage(packageName: string): Promise<boolean> {
    const result = await runComposerCommand(
      `remove ${packageName}`,
      this.projectDir
    );
    return result.exitCode === 0;
  }

  async updatePackage(packageName: string): Promise<boolean> {
    const result = await runComposerCommand(
      `update ${packageName}`,
      this.projectDir
    );
    return result.exitCode === 0;
  }

  async updateAllPackages(): Promise<boolean> {
    const result = await runComposerCommand("update", this.projectDir);
    return result.exitCode === 0;
  }

  async rollbackPackage(packageName: string, version: string): Promise<boolean> {
    const result = await runComposerCommand(
      `require ${packageName}:${version}`,
      this.projectDir
    );
    return result.exitCode === 0;
  }

  getProjectDir(): string {
    return this.projectDir;
  }

  // ===== Scripts Management =====

  async getScripts(): Promise<ComposerScript[]> {
    const composerJson = await this.readComposerJson();
    if (!composerJson?.scripts) {
      return [];
    }

    return Object.entries(composerJson.scripts).map(([name, command]) => ({
      name,
      command,
    }));
  }

  async addScript(name: string, command: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));

      if (!json.scripts) {
        json.scripts = {};
      }
      json.scripts[name] = command;

      const updated = Buffer.from(JSON.stringify(json, null, 4), "utf-8");
      await vscode.workspace.fs.writeFile(uri, updated);
      return true;
    } catch {
      return false;
    }
  }

  async removeScript(name: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));

      if (json.scripts && json.scripts[name] !== undefined) {
        delete json.scripts[name];
      }

      const updated = Buffer.from(JSON.stringify(json, null, 4), "utf-8");
      await vscode.workspace.fs.writeFile(uri, updated);
      return true;
    } catch {
      return false;
    }
  }

  async editScript(name: string, command: string): Promise<boolean> {
    return this.addScript(name, command);
  }

  async runScript(name: string): Promise<{ success: boolean; output: string }> {
    const result = await runComposerCommand(`run-script ${name}`, this.projectDir);
    return {
      success: result.exitCode === 0,
      output: result.stdout + (result.stderr ? "\n" + result.stderr : ""),
    };
  }

  async addSuggestionScripts(tool: string): Promise<boolean> {
    const suggestion = SCRIPT_SUGGESTIONS.find((s) => s.tool === tool);
    if (!suggestion) {
      return false;
    }

    // Install the package if not already present
    const composerJson = await this.readComposerJson();
    const allDeps = {
      ...composerJson?.require,
      ...composerJson?.["require-dev"],
    };

    if (!allDeps[suggestion.package]) {
      const installResult = await runComposerCommand(
        `require ${suggestion.package}${suggestion.dev ? " --dev" : ""}`,
        this.projectDir
      );
      if (installResult.exitCode !== 0) {
        return false;
      }
    }

    // Add all scripts
    for (const script of suggestion.scripts) {
      await this.addScript(script.name, script.command);
    }

    return true;
  }

  // ===== Autoload Management =====

  async getAutoloadData(): Promise<AutoloadData> {
    const json = await this.readComposerJson();
    const parse = (section: any): AutoloadConfig => {
      const psr4 = Object.entries(section?.["psr-4"] || {}).map(([ns, p]) => ({
        namespace: ns, path: Array.isArray(p) ? p[0] : p as string,
      }));
      const psr0 = Object.entries(section?.["psr-0"] || {}).map(([ns, p]) => ({
        namespace: ns, path: Array.isArray(p) ? p[0] : p as string,
      }));
      const classmap: string[] = section?.classmap || [];
      const files: string[] = section?.files || [];
      return { psr4, psr0, classmap, files };
    };
    return {
      autoload: parse(json?.autoload),
      autoloadDev: parse(json?.["autoload-dev"]),
    };
  }

  async addAutoloadEntry(
    section: "autoload" | "autoload-dev",
    entryType: "psr-4" | "classmap" | "files",
    namespaceName: string | undefined,
    entryPath: string
  ): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      const key = section === "autoload-dev" ? "autoload-dev" : "autoload";
      if (!json[key]) json[key] = {};

      if (entryType === "psr-4") {
        if (!json[key]["psr-4"]) json[key]["psr-4"] = {};
        json[key]["psr-4"][namespaceName || ""] = entryPath;
      } else if (entryType === "classmap") {
        if (!json[key].classmap) json[key].classmap = [];
        if (!json[key].classmap.includes(entryPath)) json[key].classmap.push(entryPath);
      } else if (entryType === "files") {
        if (!json[key].files) json[key].files = [];
        if (!json[key].files.includes(entryPath)) json[key].files.push(entryPath);
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  async removeAutoloadEntry(
    section: "autoload" | "autoload-dev",
    entryType: "psr-4" | "classmap" | "files",
    namespaceName: string | undefined,
    entryPath: string
  ): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      const key = section === "autoload-dev" ? "autoload-dev" : "autoload";

      if (entryType === "psr-4" && json[key]?.["psr-4"] && namespaceName) {
        delete json[key]["psr-4"][namespaceName];
      } else if (entryType === "classmap" && json[key]?.classmap) {
        json[key].classmap = json[key].classmap.filter((p: string) => p !== entryPath);
      } else if (entryType === "files" && json[key]?.files) {
        json[key].files = json[key].files.filter((p: string) => p !== entryPath);
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  async dumpAutoload(optimize: "none" | "classmap" | "authoritative" | "apcu"): Promise<boolean> {
    const flags: Record<string, string> = {
      none: "",
      classmap: "--optimize",
      authoritative: "--classmap-authoritative",
      apcu: "--apcu",
    };
    const result = await runComposerCommand(`dump-autoload ${flags[optimize]}`.trim(), this.projectDir);
    return result.exitCode === 0;
  }

  // ===== Platform Requirements =====

  async getPlatformRequirements(): Promise<PlatformRequirement[]> {
    const json = await this.readComposerJson();
    const reqs: PlatformRequirement[] = [];
    const allDeps = { ...json?.require, ...json?.["require-dev"] };

    for (const [name, constraint] of Object.entries(allDeps)) {
      if (name === "php") {
        reqs.push({ name: "php", constraint: constraint as string, type: "php" });
      } else if (name.startsWith("ext-")) {
        reqs.push({ name, constraint: constraint as string, type: "extension" });
      }
    }
    return reqs;
  }

  async checkPlatformReqs(): Promise<PlatformRequirement[]> {
    const result = await runComposerCommand("check-platform-reqs --format=json", this.projectDir, false);
    const reqs: PlatformRequirement[] = [];
    try {
      const data = JSON.parse(result.stdout);
      for (const item of data) {
        reqs.push({
          name: item.name,
          constraint: item.required_as || item.version || "",
          type: item.name === "php" ? "php" : "extension",
          installed: item.version || item.provided_version,
          status: item.status === "success" ? "ok" : item.status === "failed" ? "mismatch" : "missing",
        });
      }
    } catch { /* parse error */ }
    return reqs;
  }

  async addPlatformRequirement(name: string, constraint: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (!json.require) json.require = {};
      json.require[name] = constraint;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  async removePlatformRequirement(name: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (json.require) delete json.require[name];
      if (json["require-dev"]) delete json["require-dev"][name];
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  // ===== Health (Validate + Diagnose) =====

  async runValidate(): Promise<HealthCheck[]> {
    const result = await runComposerCommand("validate --no-check-publish", this.projectDir, false);
    const checks: HealthCheck[] = [];
    const output = result.stdout + "\n" + result.stderr;
    const lines = output.split("\n").filter(Boolean);

    for (const line of lines) {
      if (line.includes("is valid")) {
        checks.push({ label: "composer.json", status: "ok", message: line.trim() });
      } else if (line.includes("Warning") || line.includes("warning")) {
        checks.push({ label: "Warning", status: "warning", message: line.trim() });
      } else if (line.includes("error") || line.includes("Error") || line.includes("invalid")) {
        checks.push({ label: "Error", status: "error", message: line.trim() });
      } else if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
        checks.push({ label: "Issue", status: "warning", message: line.trim() });
      }
    }

    if (checks.length === 0) {
      checks.push({
        label: "Validation",
        status: result.exitCode === 0 ? "ok" : "error",
        message: result.exitCode === 0 ? "composer.json is valid" : "Validation failed",
      });
    }

    // Check lock sync
    const lockResult = await runComposerCommand("validate --check-lock", this.projectDir, false);
    const lockOutput = lockResult.stdout + lockResult.stderr;
    if (lockOutput.includes("lock file is not up to date") || lockResult.exitCode !== 0) {
      checks.push({ label: "Lock File", status: "warning", message: "composer.lock is out of sync with composer.json. Run 'composer update --lock'." });
    } else {
      checks.push({ label: "Lock File", status: "ok", message: "composer.lock is in sync" });
    }

    return checks;
  }

  async runDiagnose(): Promise<HealthCheck[]> {
    const result = await runComposerCommand("diagnose", this.projectDir, false);
    const checks: HealthCheck[] = [];
    const lines = (result.stdout + "\n" + result.stderr).split("\n").filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const label = match[1].trim();
        const msg = match[2].trim();
        let status: "ok" | "warning" | "error" = "ok";
        if (msg.toLowerCase().includes("ok") || msg.toLowerCase().includes("true")) status = "ok";
        else if (msg.toLowerCase().includes("warning") || msg.toLowerCase().includes("deprecated")) status = "warning";
        else if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("no")) status = "error";
        checks.push({ label, status, message: msg });
      }
    }
    return checks;
  }

  // ===== Framework Detection =====

  async detectFramework(): Promise<FrameworkInfo> {
    const json = await this.readComposerJson();
    const allDeps = { ...json?.require, ...json?.["require-dev"] };
    const depNames = Object.keys(allDeps);

    let type: FrameworkType = "none";
    let version: string | undefined;

    if (depNames.includes("laravel/framework")) {
      type = "laravel";
      version = allDeps["laravel/framework"];
    } else if (depNames.includes("symfony/framework-bundle")) {
      type = "symfony";
      version = allDeps["symfony/framework-bundle"];
    } else if (depNames.includes("yiisoft/yii2")) {
      type = "yii";
      version = allDeps["yiisoft/yii2"];
    } else if (depNames.includes("cakephp/cakephp")) {
      type = "cakephp";
      version = allDeps["cakephp/cakephp"];
    } else if (depNames.includes("codeigniter4/framework")) {
      type = "codeigniter";
      version = allDeps["codeigniter4/framework"];
    } else if (depNames.includes("slim/slim")) {
      type = "slim";
      version = allDeps["slim/slim"];
    } else if (depNames.includes("johnpbloch/wordpress-core") || depNames.includes("roots/wordpress")) {
      type = "wordpress";
    }

    const fw = FRAMEWORK_DATA[type] || { commands: [], quickActions: [] };
    return { type, version, commands: fw.commands, quickActions: fw.quickActions };
  }

  async runFrameworkCommand(command: string): Promise<{ success: boolean; output: string }> {
    const result = await runComposerCommand(`exec -- ${command}`, this.projectDir);
    // If that fails, try running directly
    if (result.exitCode !== 0) {
      const { exec } = require("child_process");
      return new Promise((resolve) => {
        exec(command, { cwd: this.projectDir, maxBuffer: 5 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
          resolve({ success: !err, output: stdout + (stderr ? "\n" + stderr : "") });
        });
      });
    }
    return { success: result.exitCode === 0, output: result.stdout + result.stderr };
  }

  // ===== Licenses =====

  async getLicenses(): Promise<LicenseEntry[]> {
    const result = await runComposerCommand("licenses --format=json", this.projectDir, false);
    try {
      const data = JSON.parse(result.stdout);
      const deps = data.dependencies || {};
      return Object.entries(deps).map(([name, info]: [string, any]) => ({
        name,
        version: info.version || "",
        license: info.license || [],
      }));
    } catch { return []; }
  }

  // ===== Stability =====

  async getStabilityConfig(): Promise<StabilityConfig> {
    const json = await this.readComposerJson();
    return {
      minimumStability: (json as any)?.["minimum-stability"] || "stable",
      preferStable: (json as any)?.["prefer-stable"] ?? true,
    };
  }

  async setStabilityConfig(minimumStability: string, preferStable: boolean): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      json["minimum-stability"] = minimumStability;
      json["prefer-stable"] = preferStable;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  // ===== Why / Why-Not =====

  async why(packageName: string): Promise<WhyResult[]> {
    const result = await runComposerCommand(`why ${packageName}`, this.projectDir, false);
    return result.stdout.split("\n").filter(Boolean).map((line) => ({
      packageName,
      reason: line.trim(),
    }));
  }

  async whyNot(packageName: string, version: string): Promise<WhyResult[]> {
    const result = await runComposerCommand(`why-not ${packageName} ${version}`, this.projectDir, false);
    return (result.stdout + "\n" + result.stderr).split("\n").filter(Boolean).map((line) => ({
      packageName,
      reason: line.trim(),
    }));
  }

  // ===== Repositories Management =====

  async getRepositories(): Promise<ComposerRepository[]> {
    const json = await this.readComposerJson();
    const repos = (json as any)?.repositories;
    if (!repos) return [];

    if (Array.isArray(repos)) {
      return repos.map((r: any, i: number) => ({
        type: r.type || "unknown",
        url: r.url,
        path: r.path || r.url,
        options: r.options,
        raw: r,
        index: i,
      }));
    }
    // Object format
    return Object.entries(repos).map(([key, r]: [string, any], i) => ({
      type: typeof r === "object" ? (r.type || "unknown") : "disabled",
      url: typeof r === "object" ? r.url : undefined,
      path: typeof r === "object" ? (r.path || r.url) : key,
      raw: r,
      index: i,
    }));
  }

  async addRepository(repoType: string, url: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (!json.repositories) json.repositories = [];
      const entry: any = { type: repoType };
      if (repoType === "path") entry.url = url;
      else entry.url = url;
      json.repositories.push(entry);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  async removeRepository(index: number): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (Array.isArray(json.repositories) && json.repositories[index] !== undefined) {
        json.repositories.splice(index, 1);
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }

  // ===== Suggests =====

  async getSuggests(): Promise<SuggestEntry[]> {
    const result = await runComposerCommand("suggests --all", this.projectDir, false);
    const json = await this.readComposerJson();
    const allDeps = { ...json?.require, ...json?.["require-dev"] };
    const installed = new Set(Object.keys(allDeps));

    const entries: SuggestEntry[] = [];
    const lines = result.stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      // Format: "package - reason" or "- vendor/package: reason"
      const match = line.match(/[-\s]*([a-z0-9][\w.-]*\/[\w.-]+)[:\s]+(.+)/i);
      if (match) {
        entries.push({
          name: match[1],
          reason: match[2].trim(),
          installed: installed.has(match[1]),
        });
      }
    }
    return entries;
  }

  // ===== Bump =====

  async bump(dryRun: boolean): Promise<{ success: boolean; output: string }> {
    const flag = dryRun ? "--dry-run" : "";
    const result = await runComposerCommand(`bump ${flag}`.trim(), this.projectDir);
    return { success: result.exitCode === 0, output: result.stdout + result.stderr };
  }

  // ===== Laravel Extra =====

  async getLaravelExtra(): Promise<LaravelExtra> {
    const json = await this.readComposerJson();
    const extra = (json as any)?.extra?.laravel || {};
    return {
      dontDiscover: extra["dont-discover"] || [],
      providers: extra.providers || [],
      aliases: extra.aliases || {},
    };
  }

  async setLaravelExtra(laravelExtra: LaravelExtra): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.composerJsonPath);
      const data = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(data).toString("utf-8"));
      if (!json.extra) json.extra = {};
      if (!json.extra.laravel) json.extra.laravel = {};
      json.extra.laravel["dont-discover"] = laravelExtra.dontDiscover;
      json.extra.laravel.providers = laravelExtra.providers;
      json.extra.laravel.aliases = laravelExtra.aliases;
      // Clean empty arrays
      if (json.extra.laravel["dont-discover"].length === 0) delete json.extra.laravel["dont-discover"];
      if (json.extra.laravel.providers.length === 0) delete json.extra.laravel.providers;
      if (Object.keys(json.extra.laravel.aliases).length === 0) delete json.extra.laravel.aliases;
      if (Object.keys(json.extra.laravel).length === 0) delete json.extra.laravel;
      if (Object.keys(json.extra).length === 0) delete json.extra;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 4), "utf-8"));
      return true;
    } catch { return false; }
  }
}

// ===== Framework Command Data =====

const FRAMEWORK_DATA: Record<FrameworkType, { commands: FrameworkInfo["commands"]; quickActions: FrameworkInfo["quickActions"] }> = {
  laravel: {
    quickActions: [
      { label: "Serve", command: "php artisan serve", description: "Start development server", icon: "\u{1F680}" },
      { label: "Migrate", command: "php artisan migrate", description: "Run database migrations", icon: "\u{1F4BE}" },
      { label: "Seed", command: "php artisan db:seed", description: "Seed the database", icon: "\u{1F331}" },
      { label: "Fresh Migrate", command: "php artisan migrate:fresh --seed", description: "Drop all tables, migrate and seed", icon: "\u{267B}\uFE0F" },
      { label: "Clear Cache", command: "php artisan optimize:clear", description: "Clear all caches", icon: "\u{1F9F9}" },
      { label: "Optimize", command: "php artisan optimize", description: "Cache config, routes, views", icon: "\u{26A1}" },
      { label: "Queue Work", command: "php artisan queue:work", description: "Start queue worker", icon: "\u{2699}\uFE0F" },
      { label: "Tinker", command: "php artisan tinker", description: "Interact with application", icon: "\u{1F52E}" },
    ],
    commands: [
      { name: "make:model", command: "php artisan make:model", description: "Create a new Eloquent model", category: "Make" },
      { name: "make:controller", command: "php artisan make:controller", description: "Create a new controller", category: "Make" },
      { name: "make:migration", command: "php artisan make:migration", description: "Create a new migration file", category: "Make" },
      { name: "make:seeder", command: "php artisan make:seeder", description: "Create a new seeder class", category: "Make" },
      { name: "make:middleware", command: "php artisan make:middleware", description: "Create a new middleware", category: "Make" },
      { name: "make:request", command: "php artisan make:request", description: "Create a new form request", category: "Make" },
      { name: "make:resource", command: "php artisan make:resource", description: "Create a new resource", category: "Make" },
      { name: "make:job", command: "php artisan make:job", description: "Create a new job class", category: "Make" },
      { name: "make:event", command: "php artisan make:event", description: "Create a new event class", category: "Make" },
      { name: "make:listener", command: "php artisan make:listener", description: "Create a new listener class", category: "Make" },
      { name: "make:mail", command: "php artisan make:mail", description: "Create a new email class", category: "Make" },
      { name: "make:notification", command: "php artisan make:notification", description: "Create a new notification", category: "Make" },
      { name: "make:policy", command: "php artisan make:policy", description: "Create a new policy class", category: "Make" },
      { name: "make:command", command: "php artisan make:command", description: "Create a new Artisan command", category: "Make" },
      { name: "make:factory", command: "php artisan make:factory", description: "Create a new factory", category: "Make" },
      { name: "make:test", command: "php artisan make:test", description: "Create a new test class", category: "Make" },
      { name: "route:list", command: "php artisan route:list", description: "List all registered routes", category: "Routes" },
      { name: "route:cache", command: "php artisan route:cache", description: "Cache the routes", category: "Routes" },
      { name: "config:cache", command: "php artisan config:cache", description: "Cache the configuration", category: "Cache" },
      { name: "config:clear", command: "php artisan config:clear", description: "Clear the configuration cache", category: "Cache" },
      { name: "view:cache", command: "php artisan view:cache", description: "Compile all Blade views", category: "Cache" },
      { name: "view:clear", command: "php artisan view:clear", description: "Clear all compiled views", category: "Cache" },
      { name: "cache:clear", command: "php artisan cache:clear", description: "Flush the application cache", category: "Cache" },
      { name: "storage:link", command: "php artisan storage:link", description: "Create a symbolic link", category: "Storage" },
      { name: "key:generate", command: "php artisan key:generate", description: "Set the application key", category: "Setup" },
      { name: "schedule:run", command: "php artisan schedule:run", description: "Run the scheduled commands", category: "Queue" },
      { name: "migrate:status", command: "php artisan migrate:status", description: "Show migration status", category: "Database" },
      { name: "migrate:rollback", command: "php artisan migrate:rollback", description: "Rollback the last migration", category: "Database" },
    ],
  },
  symfony: {
    quickActions: [
      { label: "Serve", command: "php bin/console server:start", description: "Start Symfony server", icon: "\u{1F680}" },
      { label: "Migrate", command: "php bin/console doctrine:migrations:migrate", description: "Run migrations", icon: "\u{1F4BE}" },
      { label: "Clear Cache", command: "php bin/console cache:clear", description: "Clear the cache", icon: "\u{1F9F9}" },
      { label: "Debug Router", command: "php bin/console debug:router", description: "Display routes", icon: "\u{1F517}" },
      { label: "Diff Migration", command: "php bin/console doctrine:migrations:diff", description: "Generate migration diff", icon: "\u{1F4DD}" },
      { label: "Warmup Cache", command: "php bin/console cache:warmup", description: "Warm up cache", icon: "\u{26A1}" },
    ],
    commands: [
      { name: "make:controller", command: "php bin/console make:controller", description: "Create a new controller", category: "Make" },
      { name: "make:entity", command: "php bin/console make:entity", description: "Create or update an entity", category: "Make" },
      { name: "make:form", command: "php bin/console make:form", description: "Create a new form class", category: "Make" },
      { name: "make:command", command: "php bin/console make:command", description: "Create a new command", category: "Make" },
      { name: "make:migration", command: "php bin/console make:migration", description: "Create a new migration", category: "Make" },
      { name: "make:subscriber", command: "php bin/console make:subscriber", description: "Create event subscriber", category: "Make" },
      { name: "make:twig-extension", command: "php bin/console make:twig-extension", description: "Create Twig extension", category: "Make" },
      { name: "make:validator", command: "php bin/console make:validator", description: "Create validator constraint", category: "Make" },
      { name: "make:voter", command: "php bin/console make:voter", description: "Create voter class", category: "Make" },
      { name: "make:test", command: "php bin/console make:test", description: "Create a test class", category: "Make" },
      { name: "debug:container", command: "php bin/console debug:container", description: "Display service container", category: "Debug" },
      { name: "debug:router", command: "php bin/console debug:router", description: "Display registered routes", category: "Debug" },
      { name: "debug:event-dispatcher", command: "php bin/console debug:event-dispatcher", description: "Display events", category: "Debug" },
      { name: "doctrine:schema:update", command: "php bin/console doctrine:schema:update --force", description: "Update database schema", category: "Doctrine" },
      { name: "doctrine:fixtures:load", command: "php bin/console doctrine:fixtures:load", description: "Load fixtures", category: "Doctrine" },
      { name: "messenger:consume", command: "php bin/console messenger:consume async", description: "Consume messages", category: "Messenger" },
    ],
  },
  yii: {
    quickActions: [
      { label: "Serve", command: "php yii serve", description: "Start development server", icon: "\u{1F680}" },
      { label: "Migrate", command: "php yii migrate", description: "Run database migrations", icon: "\u{1F4BE}" },
      { label: "Cache Flush", command: "php yii cache/flush-all", description: "Flush all caches", icon: "\u{1F9F9}" },
    ],
    commands: [
      { name: "migrate/create", command: "php yii migrate/create", description: "Create a new migration", category: "Database" },
      { name: "gii/model", command: "php yii gii/model", description: "Generate a model", category: "Generate" },
      { name: "gii/controller", command: "php yii gii/controller", description: "Generate a controller", category: "Generate" },
    ],
  },
  cakephp: {
    quickActions: [
      { label: "Serve", command: "bin/cake server", description: "Start development server", icon: "\u{1F680}" },
      { label: "Migrate", command: "bin/cake migrations migrate", description: "Run database migrations", icon: "\u{1F4BE}" },
      { label: "Clear Cache", command: "bin/cake cache clear_all", description: "Clear all caches", icon: "\u{1F9F9}" },
    ],
    commands: [
      { name: "bake model", command: "bin/cake bake model", description: "Bake a model", category: "Bake" },
      { name: "bake controller", command: "bin/cake bake controller", description: "Bake a controller", category: "Bake" },
      { name: "bake migration", command: "bin/cake bake migration", description: "Bake a migration", category: "Bake" },
    ],
  },
  codeigniter: {
    quickActions: [
      { label: "Serve", command: "php spark serve", description: "Start development server", icon: "\u{1F680}" },
      { label: "Migrate", command: "php spark migrate", description: "Run database migrations", icon: "\u{1F4BE}" },
    ],
    commands: [
      { name: "make:controller", command: "php spark make:controller", description: "Create a controller", category: "Make" },
      { name: "make:model", command: "php spark make:model", description: "Create a model", category: "Make" },
      { name: "make:migration", command: "php spark make:migration", description: "Create a migration", category: "Make" },
      { name: "make:seeder", command: "php spark make:seeder", description: "Create a seeder", category: "Make" },
    ],
  },
  slim: {
    quickActions: [
      { label: "Serve", command: "php -S localhost:8080 -t public", description: "Start PHP built-in server", icon: "\u{1F680}" },
    ],
    commands: [],
  },
  wordpress: {
    quickActions: [
      { label: "WP CLI Info", command: "wp --info", description: "Display WP-CLI information", icon: "\u{2139}\uFE0F" },
    ],
    commands: [
      { name: "plugin list", command: "wp plugin list", description: "List installed plugins", category: "Plugins" },
      { name: "theme list", command: "wp theme list", description: "List installed themes", category: "Themes" },
      { name: "core update", command: "wp core update", description: "Update WordPress core", category: "Core" },
      { name: "db export", command: "wp db export", description: "Export database", category: "Database" },
    ],
  },
  none: { commands: [], quickActions: [] },
};

export const SCRIPT_SUGGESTIONS: ScriptSuggestion[] = [
  {
    tool: "phpstan",
    description: "PHP Static Analysis Tool - find bugs before they reach production",
    package: "phpstan/phpstan",
    dev: true,
    scripts: [
      { name: "phpstan", command: "vendor/bin/phpstan analyse" },
      { name: "phpstan:baseline", command: "vendor/bin/phpstan analyse --generate-baseline" },
    ],
  },
  {
    tool: "rector",
    description: "Automated refactoring and instant upgrades for PHP",
    package: "rector/rector",
    dev: true,
    scripts: [
      { name: "rector", command: "vendor/bin/rector process" },
      { name: "rector:dry", command: "vendor/bin/rector process --dry-run" },
    ],
  },
  {
    tool: "pint",
    description: "Laravel Pint - opinionated PHP code style fixer built on PHP-CS-Fixer",
    package: "laravel/pint",
    dev: true,
    scripts: [
      { name: "pint", command: "vendor/bin/pint" },
      { name: "pint:test", command: "vendor/bin/pint --test" },
    ],
  },
  {
    tool: "pest",
    description: "Pest - an elegant PHP testing framework with a focus on simplicity",
    package: "pestphp/pest",
    dev: true,
    scripts: [
      { name: "test", command: "vendor/bin/pest" },
      { name: "test:coverage", command: "vendor/bin/pest --coverage" },
      { name: "test:parallel", command: "vendor/bin/pest --parallel" },
      { name: "test:watch", command: "vendor/bin/pest --watch" },
    ],
  },
  {
    tool: "phpunit",
    description: "PHPUnit - the PHP testing framework",
    package: "phpunit/phpunit",
    dev: true,
    scripts: [
      { name: "test", command: "vendor/bin/phpunit" },
      { name: "test:coverage", command: "vendor/bin/phpunit --coverage-html coverage" },
      { name: "test:filter", command: "vendor/bin/phpunit --filter" },
    ],
  },
  {
    tool: "php-cs-fixer",
    description: "PHP Coding Standards Fixer - fix your code to follow standards",
    package: "friendsofphp/php-cs-fixer",
    dev: true,
    scripts: [
      { name: "cs:fix", command: "vendor/bin/php-cs-fixer fix" },
      { name: "cs:check", command: "vendor/bin/php-cs-fixer fix --dry-run --diff" },
    ],
  },
  {
    tool: "phpmd",
    description: "PHP Mess Detector - detect code smells, unused code, and complexity",
    package: "phpmd/phpmd",
    dev: true,
    scripts: [
      { name: "phpmd", command: "vendor/bin/phpmd src text cleancode,codesize,controversial,design,naming,unusedcode" },
    ],
  },
  {
    tool: "psalm",
    description: "Psalm - a static analysis tool for finding errors in PHP",
    package: "vimeo/psalm",
    dev: true,
    scripts: [
      { name: "psalm", command: "vendor/bin/psalm" },
      { name: "psalm:fix", command: "vendor/bin/psalm --alter --issues=all" },
    ],
  },
];
