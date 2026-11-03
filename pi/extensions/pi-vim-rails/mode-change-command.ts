import { spawn } from "node:child_process";

import type { ModeChangeSettings } from "./settings.js";
import type { Mode } from "./types.js";

const MODE_CHANGE_COMMAND_TIMEOUT_MS = 2000;

type ModeChangeCommandRunner = (command: string) => void;
type RunningModeChangeCommand = {
  child: ReturnType<typeof spawn>;
  timeout: ReturnType<typeof setTimeout>;
};
export type ModeChangeEvent = { mode: Mode; previousMode: Mode };

let activeModeChangeCommand: RunningModeChangeCommand | null = null;
let pendingModeChangeCommand: string | null = null;
let modeChangeCommandRunner: ModeChangeCommandRunner = spawnModeChangeCommand;

export function setModeChangeCommandRunnerForTests(
  next: ModeChangeCommandRunner,
): () => void {
  const prev = modeChangeCommandRunner;
  modeChangeCommandRunner = next;
  return () => {
    modeChangeCommandRunner = prev;
  };
}

function spawnModeChangeCommand(command: string): void {
  if (!command) return;
  if (activeModeChangeCommand) {
    pendingModeChangeCommand = command;
    return;
  }

  startModeChangeCommand(command);
}

function startModeChangeCommand(command: string): void {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(command, {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // spawn rejected synchronously (e.g., EMFILE) — never break the editor
    runPendingModeChangeCommand();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (activeModeChangeCommand?.child !== child) return;
    activeModeChangeCommand = null;
    runPendingModeChangeCommand();
  };
  const timeout = setTimeout(() => {
    try {
      child.kill();
    } catch {
      // best effort timeout cleanup
    }
    finish();
  }, MODE_CHANGE_COMMAND_TIMEOUT_MS);
  timeout.unref?.();

  activeModeChangeCommand = { child, timeout };
  child.once("error", finish);
  child.once("close", finish);
}

function runPendingModeChangeCommand(): void {
  const pending = pendingModeChangeCommand;
  pendingModeChangeCommand = null;
  if (pending) startModeChangeCommand(pending);
}

function clearPendingModeChangeCommand(): void {
  pendingModeChangeCommand = null;
}

export function cancelModeChangeCommands(): void {
  pendingModeChangeCommand = null;
  const active = activeModeChangeCommand;
  activeModeChangeCommand = null;
  if (!active) return;
  clearTimeout(active.timeout);
  try {
    active.child.kill();
  } catch {
    // best effort session cleanup
  }
}

export function createModeChangeHandler(
  modeChange: ModeChangeSettings | undefined,
  emitModeChange: (event: ModeChangeEvent) => void,
): (mode: Mode, prevMode: Mode) => void {
  const insert = modeChange?.insert;
  const normal = modeChange?.normal;
  return (mode, previousMode) => {
    try {
      emitModeChange({ mode, previousMode });
    } catch {
      // Subscribers must not break editing or configured mode-change commands.
    }

    const command = mode === "insert" ? insert : normal;
    if (command) {
      modeChangeCommandRunner(command);
    } else {
      clearPendingModeChangeCommand();
    }
  };
}
