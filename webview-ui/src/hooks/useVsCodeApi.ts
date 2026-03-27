import { MessageFromWebview } from "../types";

const vscodeApi = acquireVsCodeApi();

export function postMessage(message: MessageFromWebview): void {
  vscodeApi.postMessage(message);
}

export function getState<T>(): T | undefined {
  return vscodeApi.getState() as T | undefined;
}

export function setState<T>(state: T): void {
  vscodeApi.setState(state);
}
