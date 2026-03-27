import * as vscode from "vscode";
import * as path from "path";
import { ComposerService } from "../services/composerService";
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
            await this.handleInstall(message.packageName, message.dev);
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

  private async handleInstall(packageName: string, dev: boolean) {
    this.panel.webview.postMessage({ type: "loading", loading: true });
    const success = await this.composerService.installPackage(packageName, dev);
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
