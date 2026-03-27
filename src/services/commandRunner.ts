import * as vscode from "vscode";
import { exec, ExecException } from "child_process";

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Composer Visual Manager");
  }
  return outputChannel;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runComposerCommand(
  args: string,
  cwd: string,
  showOutput: boolean = true
): Promise<CommandResult> {
  const channel = getOutputChannel();

  if (showOutput) {
    channel.show(true);
    channel.appendLine(`> composer ${args}`);
    channel.appendLine("");
  }

  return new Promise((resolve) => {
    const process = exec(
      `composer ${args} --no-interaction --no-ansi`,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (showOutput) {
          if (stdout) {
            channel.appendLine(stdout);
          }
          if (stderr) {
            channel.appendLine(stderr);
          }
          channel.appendLine("");
        }

        resolve({
          stdout,
          stderr,
          exitCode: error?.code ?? 0,
        });
      }
    );
  });
}

export async function isComposerAvailable(cwd: string): Promise<boolean> {
  try {
    const result = await runComposerCommand("--version", cwd, false);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
