import * as vscode from "vscode";
import * as path from "path";
import { ComposerPackage, SecurityAdvisory, InstallOptions, ComposerScript, ScriptSuggestion } from "../types";
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
}

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
