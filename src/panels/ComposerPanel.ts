import * as vscode from "vscode";
import * as path from "path";
import { ComposerService, SCRIPT_SUGGESTIONS } from "../services/composerService";
import { CacheService } from "../services/cacheService";
import { searchPackages } from "../services/packagistApi";

import { MessageFromWebview, ColumnConfig } from "../types";

export class ComposerPanel {
  public static currentPanel: ComposerPanel | undefined;
  private static readonly viewType = "composerVisualManager";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private composerService: ComposerService;
  private disposables: vscode.Disposable[] = [];
  private searchAbortController: AbortController | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  public static createOrShow(
    extensionUri: vscode.Uri,
    composerJsonPath: string,
    context: vscode.ExtensionContext
  ) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (ComposerPanel.currentPanel) {
      ComposerPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ComposerPanel.viewType,
      "Composer Visual Manager",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "webview-ui", "dist"),
        ],
      }
    );

    ComposerPanel.currentPanel = new ComposerPanel(
      panel,
      extensionUri,
      composerJsonPath,
      context
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    composerJsonPath: string,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    const cache = new CacheService(context, path.dirname(composerJsonPath));
    this.composerService = new ComposerService(composerJsonPath, cache);

    this.panel.webview.html = this.getHtmlForWebview();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.setupMessageHandler();
    this.setupFileWatcher(composerJsonPath);
  }

  private setupFileWatcher(composerJsonPath: string) {
    const pattern = new vscode.RelativePattern(
      path.dirname(composerJsonPath),
      "composer.json"
    );
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidChange(() => {
      this.refreshPackages(false);
    });

    this.disposables.push(this.fileWatcher);
  }

  private setupMessageHandler() {
    this.panel.webview.onDidReceiveMessage(
      async (message: MessageFromWebview) => {
        switch (message.type) {
          case "requestPackages":
            await this.refreshPackages(false);
            break;

          case "refresh":
            await this.refreshPackages(true);
            break;

          case "search":
            await this.handleSearch(message.query);
            break;

          case "install":
            await this.handleInstall(message.packageName, message.options);
            break;

          case "installFromGithub":
            await this.handleInstallFromGithub(message.url, message.packageName, message.options);
            break;

          case "installFromPath":
            await this.handleInstallFromPath(message.path, message.packageName, message.options);
            break;

          case "browseLocalPath":
            await this.handleBrowseLocalPath();
            break;

          case "uninstall":
            await this.handleUninstall(message.packageName);
            break;

          case "update":
            await this.handleUpdate(message.packageName);
            break;

          case "updateAll":
            await this.handleUpdateAll();
            break;

          case "rollback":
            await this.handleRollback(message.packageName, message.version);
            break;

          case "ignore":
            await this.handleIgnore(message.packageName, message.reason);
            break;

          case "unignore":
            await this.handleUnignore(message.packageName);
            break;

          case "openExternal":
            vscode.env.openExternal(vscode.Uri.parse(message.url));
            break;

          case "requestConfig":
            this.sendConfig();
            break;

          case "requestScripts":
            await this.handleRequestScripts();
            break;

          case "addScript":
            await this.handleAddScript(message.name, message.command);
            break;

          case "removeScript":
            await this.handleRemoveScript(message.name);
            break;

          case "editScript":
            await this.handleEditScript(message.name, message.command);
            break;

          case "runScript":
            await this.handleRunScript(message.name);
            break;

          case "addSuggestion":
            await this.handleAddSuggestion(message.tool);
            break;

          // Autoload
          case "requestAutoload":
            await this.sendAutoload();
            break;
          case "addAutoloadEntry":
            await this.handleAddAutoloadEntry(message.section, message.entryType, message.namespace, message.path);
            break;
          case "removeAutoloadEntry":
            await this.handleRemoveAutoloadEntry(message.section, message.entryType, message.namespace, message.path);
            break;
          case "dumpAutoload":
            await this.handleDumpAutoload(message.optimize);
            break;

          // Platform
          case "requestPlatform":
            await this.sendPlatform();
            break;
          case "addPlatformReq":
            await this.handleAddPlatformReq(message.name, message.constraint);
            break;
          case "removePlatformReq":
            await this.handleRemovePlatformReq(message.name);
            break;
          case "checkPlatformReqs":
            await this.handleCheckPlatformReqs();
            break;

          // Health
          case "runValidate":
            await this.handleRunValidate();
            break;
          case "runDiagnose":
            await this.handleRunDiagnose();
            break;

          // Framework
          case "requestFrameworkInfo":
            await this.sendFrameworkInfo();
            break;
          case "runFrameworkCommand":
            await this.handleRunFrameworkCommand(message.command);
            break;

          // Licenses
          case "requestLicenses":
            await this.sendLicenses();
            break;

          // Stability
          case "requestStability":
            await this.sendStability();
            break;
          case "setStability":
            await this.handleSetStability(message.minimumStability, message.preferStable);
            break;

          // Why
          case "why":
            await this.handleWhy(message.packageName);
            break;
          case "whyNot":
            await this.handleWhyNot(message.packageName, message.version);
            break;

          // Repositories
          case "requestRepositories":
            await this.sendRepositories();
            break;
          case "addRepository":
            await this.handleAddRepository(message.repoType, message.url);
            break;
          case "removeRepository":
            await this.handleRemoveRepository(message.index);
            break;

          // Suggests
          case "requestSuggests":
            await this.sendSuggests();
            break;
          case "installSuggested":
            await this.handleInstall(message.packageName, { dev: false });
            break;

          // Bump
          case "bump":
            await this.handleBump(message.dryRun);
            break;

          // Laravel Extra
          case "requestLaravelExtra":
            await this.sendLaravelExtra();
            break;
          case "addDontDiscover":
            await this.handleLaravelExtraModify("addDontDiscover", message.packageName);
            break;
          case "removeDontDiscover":
            await this.handleLaravelExtraModify("removeDontDiscover", message.packageName);
            break;
          case "addLaravelProvider":
            await this.handleLaravelExtraModify("addProvider", message.provider);
            break;
          case "removeLaravelProvider":
            await this.handleLaravelExtraModify("removeProvider", message.provider);
            break;
          case "addLaravelAlias":
            await this.handleLaravelAlias("add", message.alias, message.className);
            break;
          case "removeLaravelAlias":
            await this.handleLaravelAlias("remove", message.alias);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  private async refreshPackages(forceRefresh: boolean) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    try {
      const packages = await this.composerService.getPackages(forceRefresh);
      this.panel.webview.postMessage({ type: "packages", data: packages });
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: "error",
        message: err.message || "Failed to load packages",
      });
    }
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  private async handleSearch(query: string) {
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();

    try {
      const results = await searchPackages(query, this.searchAbortController.signal);
      this.panel.webview.postMessage({ type: "searchResults", data: results });
    } catch {
      // Aborted or failed - ignore
    }
  }

  private async handleInstall(packageName: string, options: import("../types").InstallOptions) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.installPackage(packageName, options);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "install",
      success,
      message: success
        ? `Successfully installed ${packageName}`
        : `Failed to install ${packageName}`,
    });
    await this.refreshPackages(true);
  }

  private async handleInstallFromGithub(
    url: string,
    packageName: string | undefined,
    options: import("../types").InstallOptions
  ) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.installFromGithub(url, packageName, options);
    const label = packageName || url;
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "install",
      success,
      message: success
        ? `Successfully installed ${label} from GitHub`
        : `Failed to install from ${url}. Make sure the URL is valid and the repository contains a composer.json.`,
    });
    await this.refreshPackages(true);
  }

  private async handleInstallFromPath(
    localPath: string,
    packageName: string | undefined,
    options: import("../types").InstallOptions
  ) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.installFromPath(localPath, packageName, options);
    const label = packageName || localPath;
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "install",
      success,
      message: success
        ? `Successfully installed ${label} from local path`
        : `Failed to install from ${localPath}. Make sure the path contains a valid composer.json with a "name" field.`,
    });
    await this.refreshPackages(true);
  }

  private async handleBrowseLocalPath() {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select Package Folder",
      title: "Select a local Composer package directory",
    });
    if (result && result[0]) {
      this.panel.webview.postMessage({
        type: "localPathSelected",
        path: result[0].fsPath,
      });
    }
  }

  private async handleUninstall(packageName: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.uninstallPackage(packageName);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "uninstall",
      success,
      message: success
        ? `Successfully removed ${packageName}`
        : `Failed to remove ${packageName}`,
    });
    await this.refreshPackages(true);
  }

  private async handleUpdate(packageName: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.updatePackage(packageName);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "update",
      success,
      message: success
        ? `Successfully updated ${packageName}`
        : `Failed to update ${packageName}`,
    });
    await this.refreshPackages(true);
  }

  private async handleUpdateAll() {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.updateAllPackages();
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "updateAll",
      success,
      message: success
        ? "Successfully updated all packages"
        : "Failed to update packages",
    });
    await this.refreshPackages(true);
  }

  private async handleRollback(packageName: string, version: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.rollbackPackage(packageName, version);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "rollback",
      success,
      message: success
        ? `Successfully rolled back ${packageName} to ${version}`
        : `Failed to rollback ${packageName}`,
    });
    await this.refreshPackages(true);
  }

  private async handleIgnore(packageName: string, reason?: string) {
    const config = vscode.workspace.getConfiguration("composerVisualManager");
    const ignored = config.get<any[]>("ignoredPackages") || [];
    if (!ignored.some((p) => p.name === packageName)) {
      ignored.push({ name: packageName, reason });
      await config.update("ignoredPackages", ignored, vscode.ConfigurationTarget.Workspace);
    }
    await this.refreshPackages(false);
  }

  private async handleUnignore(packageName: string) {
    const config = vscode.workspace.getConfiguration("composerVisualManager");
    const ignored = config.get<any[]>("ignoredPackages") || [];
    const filtered = ignored.filter((p) => p.name !== packageName);
    await config.update("ignoredPackages", filtered, vscode.ConfigurationTarget.Workspace);
    await this.refreshPackages(false);
  }

  // ===== Script Handlers =====

  private async handleRequestScripts() {
    try {
      const scripts = await this.composerService.getScripts();
      this.panel.webview.postMessage({ type: "scripts", data: scripts });
    } catch {
      this.panel.webview.postMessage({ type: "scripts", data: [] });
    }
  }

  private async handleAddScript(name: string, command: string) {
    const success = await this.composerService.addScript(name, command);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "addScript",
      success,
      message: success
        ? `Added script "${name}"`
        : `Failed to add script "${name}"`,
    });
    await this.handleRequestScripts();
  }

  private async handleRemoveScript(name: string) {
    const success = await this.composerService.removeScript(name);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "removeScript",
      success,
      message: success
        ? `Removed script "${name}"`
        : `Failed to remove script "${name}"`,
    });
    await this.handleRequestScripts();
  }

  private async handleEditScript(name: string, command: string) {
    const success = await this.composerService.editScript(name, command);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "editScript",
      success,
      message: success
        ? `Updated script "${name}"`
        : `Failed to update script "${name}"`,
    });
    await this.handleRequestScripts();
  }

  private async handleRunScript(name: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const { success, output } = await this.composerService.runScript(name);
    this.panel.webview.postMessage({ type: "scriptOutput", output });
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "runScript",
      success,
      message: success
        ? `Script "${name}" completed successfully`
        : `Script "${name}" failed`,
    });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  private async handleAddSuggestion(tool: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.addSuggestionScripts(tool);
    const suggestion = SCRIPT_SUGGESTIONS.find((s) => s.tool === tool);
    this.panel.webview.postMessage({
      type: "operationComplete",
      operation: "addSuggestion",
      success,
      message: success
        ? `Added ${suggestion?.tool} scripts and installed ${suggestion?.package}`
        : `Failed to set up ${tool}`,
    });
    await this.handleRequestScripts();
    await this.refreshPackages(true);
  }

  // ===== Autoload Handlers =====

  private async sendAutoload() {
    const data = await this.composerService.getAutoloadData();
    this.panel.webview.postMessage({ type: "autoloadData", data });
  }

  private async handleAddAutoloadEntry(section: string, entryType: string, ns: string | undefined, p: string) {
    const success = await this.composerService.addAutoloadEntry(section as any, entryType as any, ns, p);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "addAutoload", success, message: success ? "Autoload entry added" : "Failed to add autoload entry" });
    await this.sendAutoload();
  }

  private async handleRemoveAutoloadEntry(section: string, entryType: string, ns: string | undefined, p: string) {
    const success = await this.composerService.removeAutoloadEntry(section as any, entryType as any, ns, p);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "removeAutoload", success, message: success ? "Autoload entry removed" : "Failed to remove autoload entry" });
    await this.sendAutoload();
  }

  private async handleDumpAutoload(optimize: "none" | "classmap" | "authoritative" | "apcu") {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.dumpAutoload(optimize);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "dumpAutoload", success, message: success ? `Autoload dumped${optimize !== "none" ? ` (${optimize})` : ""}` : "Failed to dump autoload" });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  // ===== Platform Handlers =====

  private async sendPlatform() {
    const data = await this.composerService.getPlatformRequirements();
    this.panel.webview.postMessage({ type: "platformRequirements", data });
  }

  private async handleAddPlatformReq(name: string, constraint: string) {
    const success = await this.composerService.addPlatformRequirement(name, constraint);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "addPlatform", success, message: success ? `Added ${name} requirement` : `Failed to add ${name}` });
    await this.sendPlatform();
  }

  private async handleRemovePlatformReq(name: string) {
    const success = await this.composerService.removePlatformRequirement(name);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "removePlatform", success, message: success ? `Removed ${name} requirement` : `Failed to remove ${name}` });
    await this.sendPlatform();
  }

  private async handleCheckPlatformReqs() {
    const data = await this.composerService.checkPlatformReqs();
    this.panel.webview.postMessage({ type: "platformRequirements", data });
  }

  // ===== Health Handlers =====

  private async handleRunValidate() {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const data = await this.composerService.runValidate();
    this.panel.webview.postMessage({ type: "healthChecks", data });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  private async handleRunDiagnose() {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const data = await this.composerService.runDiagnose();
    this.panel.webview.postMessage({ type: "healthChecks", data });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  // ===== Framework Handlers =====

  private async sendFrameworkInfo() {
    const data = await this.composerService.detectFramework();
    this.panel.webview.postMessage({ type: "frameworkInfo", data });
  }

  private async handleRunFrameworkCommand(command: string) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const { success, output } = await this.composerService.runFrameworkCommand(command);
    this.panel.webview.postMessage({ type: "commandOutput", title: command, output });
    this.panel.webview.postMessage({ type: "operationComplete", operation: "frameworkCommand", success, message: success ? `Command completed` : `Command failed` });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  // ===== Licenses Handler =====

  private async sendLicenses() {
    const data = await this.composerService.getLicenses();
    this.panel.webview.postMessage({ type: "licenses", data });
  }

  // ===== Stability Handlers =====

  private async sendStability() {
    const data = await this.composerService.getStabilityConfig();
    this.panel.webview.postMessage({ type: "stabilityConfig", data });
  }

  private async handleSetStability(minimumStability: string, preferStable: boolean) {
    const success = await this.composerService.setStabilityConfig(minimumStability, preferStable);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "setStability", success, message: success ? "Stability settings updated" : "Failed to update stability" });
    await this.sendStability();
  }

  // ===== Why Handlers =====

  private async handleWhy(packageName: string) {
    const data = await this.composerService.why(packageName);
    this.panel.webview.postMessage({ type: "whyResult", data });
  }

  private async handleWhyNot(packageName: string, version: string) {
    const data = await this.composerService.whyNot(packageName, version);
    this.panel.webview.postMessage({ type: "whyResult", data });
  }

  // ===== Repositories Handlers =====

  private async sendRepositories() {
    const data = await this.composerService.getRepositories();
    this.panel.webview.postMessage({ type: "repositories", data });
  }

  private async handleAddRepository(repoType: string, url: string) {
    const success = await this.composerService.addRepository(repoType, url);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "addRepo", success, message: success ? `Added ${repoType} repository` : "Failed to add repository" });
    await this.sendRepositories();
  }

  private async handleRemoveRepository(index: number) {
    const success = await this.composerService.removeRepository(index);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "removeRepo", success, message: success ? "Repository removed" : "Failed to remove repository" });
    await this.sendRepositories();
  }

  // ===== Suggests Handler =====

  private async sendSuggests() {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const data = await this.composerService.getSuggests();
    this.panel.webview.postMessage({ type: "suggests", data });
    this.panel.webview.postMessage({ type: "loading", loading: false });
  }

  // ===== Bump Handler =====

  private async handleBump(dryRun: boolean) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const { success, output } = await this.composerService.bump(dryRun);
    this.panel.webview.postMessage({ type: "commandOutput", title: dryRun ? "Bump (Dry Run)" : "Bump", output });
    this.panel.webview.postMessage({ type: "operationComplete", operation: "bump", success, message: success ? (dryRun ? "Dry run complete" : "Version constraints bumped") : "Bump failed" });
    this.panel.webview.postMessage({ type: "loading", loading: false });
    if (!dryRun) await this.refreshPackages(true);
  }

  // ===== Laravel Extra Handlers =====

  private async sendLaravelExtra() {
    const data = await this.composerService.getLaravelExtra();
    this.panel.webview.postMessage({ type: "laravelExtra", data });
  }

  private async handleLaravelExtraModify(action: string, value: string) {
    const extra = await this.composerService.getLaravelExtra();
    if (action === "addDontDiscover" && !extra.dontDiscover.includes(value)) extra.dontDiscover.push(value);
    if (action === "removeDontDiscover") extra.dontDiscover = extra.dontDiscover.filter((v) => v !== value);
    if (action === "addProvider" && !extra.providers.includes(value)) extra.providers.push(value);
    if (action === "removeProvider") extra.providers = extra.providers.filter((v) => v !== value);
    const success = await this.composerService.setLaravelExtra(extra);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "laravelExtra", success, message: success ? "Updated" : "Failed" });
    await this.sendLaravelExtra();
  }

  private async handleLaravelAlias(action: string, alias: string, className?: string) {
    const extra = await this.composerService.getLaravelExtra();
    if (action === "add" && className) extra.aliases[alias] = className;
    if (action === "remove") delete extra.aliases[alias];
    const success = await this.composerService.setLaravelExtra(extra);
    this.panel.webview.postMessage({ type: "operationComplete", operation: "laravelExtra", success, message: success ? "Updated" : "Failed" });
    await this.sendLaravelExtra();
  }

  private sendConfig() {
    const config = vscode.workspace.getConfiguration("composerVisualManager");
    const columnConfig: ColumnConfig = {
      type: config.get<boolean>("columns.type", true),
      lastUpdate: config.get<boolean>("columns.lastUpdate", true),
      security: config.get<boolean>("columns.security", true),
      semverUpdate: config.get<boolean>("columns.semverUpdate", true),
      phpVersion: config.get<boolean>("columns.phpVersion", false),
    };
    this.panel.webview.postMessage({ type: "config", data: columnConfig });
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "webview-ui", "dist");

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "assets", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "assets", "index.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Composer Visual Manager</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    ComposerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
