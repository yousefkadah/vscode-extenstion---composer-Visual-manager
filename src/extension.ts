import * as vscode from "vscode";
import * as path from "path";
import { ComposerPanel } from "./panels/ComposerPanel";
import { SidebarProvider } from "./panels/SidebarProvider";
import { isComposerAvailable } from "./services/commandRunner";

export function activate(context: vscode.ExtensionContext) {
  // Register sidebar
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register open command
  const openCommand = vscode.commands.registerCommand(
    "composerVisualManager.open",
    async (uri?: vscode.Uri) => {
      let composerJsonPath: string | undefined;

      if (uri) {
        composerJsonPath = uri.fsPath;
      } else {
        // Find composer.json in workspace
        composerJsonPath = await findComposerJson();
      }

      if (!composerJsonPath) {
        vscode.window.showErrorMessage(
          "No composer.json found in the workspace."
        );
        return;
      }

      const cwd = path.dirname(composerJsonPath);
      const available = await isComposerAvailable(cwd);
      if (!available) {
        vscode.window.showErrorMessage(
          "Composer is not installed or not in PATH. Please install Composer first."
        );
        return;
      }

      ComposerPanel.createOrShow(context.extensionUri, composerJsonPath, context);
    }
  );

  context.subscriptions.push(openCommand);
}

async function findComposerJson(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return undefined;
  }

  // Check root of each workspace folder first
  for (const folder of workspaceFolders) {
    const composerJsonPath = path.join(folder.uri.fsPath, "composer.json");
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(composerJsonPath));
      return composerJsonPath;
    } catch {
      // Not found, continue
    }
  }

  // Search deeper
  const files = await vscode.workspace.findFiles("**/composer.json", "**/vendor/**", 10);
  if (files.length === 0) {
    return undefined;
  }

  if (files.length === 1) {
    return files[0].fsPath;
  }

  // Let user pick
  const items = files.map((f) => ({
    label: vscode.workspace.asRelativePath(f),
    detail: f.fsPath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a composer.json file",
  });

  return picked?.detail;
}

export function deactivate() {}
