import * as vscode from "vscode";
import * as path from "path";
import { ComposerPackage, SecurityAdvisory } from "../types";
import { runComposerCommand } from "./commandRunner";
import { getPackageInfo, getLatestStableVersion } from "./packagistApi";
import { CacheService } from "./cacheService";

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
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

  async installPackage(packageName: string, dev: boolean): Promise<boolean> {
    const devFlag = dev ? " --dev" : "";
    const result = await runComposerCommand(
      `require ${packageName}${devFlag}`,
      this.projectDir
    );
    return result.exitCode === 0;
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
}
