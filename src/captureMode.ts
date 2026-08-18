import { JupyterFrontEnd } from '@jupyterlab/application';
import { CommandToolbarButton } from '@jupyterlab/apputils';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import {
  DEFAULT_SETTINGS,
  IExtensionSettings,
  SettingsController
} from './settings';

export const TOGGLE_CAPTURE_MODE_COMMAND =
  'math-notebook-tools:toggle-capture-mode';

const CAPTURE_MODE_CLASS = 'mnt-mod-captureMode';
const CAPTURE_SCALE_PROPERTY = '--mnt-capture-scale';
const MATPLOTLIB_FONT_KEYS = [
  'font.size',
  'axes.titlesize',
  'axes.labelsize',
  'xtick.labelsize',
  'ytick.labelsize',
  'legend.fontsize'
];

export function buildMatplotlibCaptureCode(
  enabled: boolean,
  scale: number
): string {
  if (!enabled) {
    return [
      'import matplotlib as _mnt_mpl',
      '_mnt_saved = getattr(_mnt_mpl, "_mnt_capture_mode_rcparams", None)',
      'if _mnt_saved is not None:',
      '    _mnt_mpl.rcParams.update(_mnt_saved)',
      '    delattr(_mnt_mpl, "_mnt_capture_mode_rcparams")'
    ].join('\n');
  }

  const keys = MATPLOTLIB_FONT_KEYS.map(key => JSON.stringify(key)).join(', ');
  return [
    'import matplotlib as _mnt_mpl',
    'from numbers import Number as _mnt_Number',
    `_mnt_keys = (${keys},)`,
    'if not hasattr(_mnt_mpl, "_mnt_capture_mode_rcparams"):',
    '    _mnt_mpl._mnt_capture_mode_rcparams = {',
    '        key: _mnt_mpl.rcParams[key] for key in _mnt_keys',
    '    }',
    '_mnt_mpl.rcParams.update({',
    `    key: value * ${scale} if isinstance(value, _mnt_Number) else value`,
    '    for key, value in _mnt_mpl._mnt_capture_mode_rcparams.items()',
    '})'
  ].join('\n');
}

export class CaptureModeController {
  constructor(options: CaptureModeController.IOptions) {
    this._app = options.app;
    this._settings = options.settings;
    this._tracker = options.tracker;

    this._app.commands.addCommand(TOGGLE_CAPTURE_MODE_COMMAND, {
      describedBy: {
        args: {
          type: 'object',
          properties: {
            toolbar: { type: 'boolean' }
          }
        }
      },
      label: args =>
        args['toolbar'] === true ? 'Capture' : 'Toggle Capture Mode',
      isToggled: () => this._enabled,
      execute: async () => {
        await this._settings.setCaptureModeEnabled(!this._enabled);
      }
    });

    options.tracker.widgetAdded.connect((_, panel) => this._attach(panel));
    options.tracker.forEach(panel => this._attach(panel));
    this._settings.changed.connect((_, settings) =>
      this.updateSettings(settings)
    );
    this.updateSettings(this._settings.settings);
  }

  updateSettings(settings: IExtensionSettings): void {
    const shouldUpdateKernel =
      this._initialized &&
      (settings.captureModeEnabled !== this._enabled ||
        (settings.captureModeEnabled &&
          settings.captureModeScale !== this._scale));
    this._enabled = settings.captureModeEnabled;
    this._scale = settings.captureModeScale;
    this._initialized = true;
    document.documentElement.classList.toggle(
      CAPTURE_MODE_CLASS,
      this._enabled
    );
    document.documentElement.style.setProperty(
      CAPTURE_SCALE_PROPERTY,
      String(settings.captureModeScale)
    );
    this._app.commands.notifyCommandChanged(TOGGLE_CAPTURE_MODE_COMMAND);
    if (shouldUpdateKernel) {
      void this._updateKernelPlotDefaults(settings).catch(reason => {
        console.error('Failed to update Matplotlib capture defaults.', reason);
      });
    }
  }

  private _attach(panel: NotebookPanel): void {
    if (Array.from(panel.toolbar.names()).includes('captureMode')) {
      return;
    }
    panel.toolbar.addItem(
      'captureMode',
      new CommandToolbarButton({
        commands: this._app.commands,
        id: TOGGLE_CAPTURE_MODE_COMMAND,
        args: { toolbar: true }
      })
    );
  }

  private async _updateKernelPlotDefaults(
    settings: IExtensionSettings
  ): Promise<void> {
    const kernel = this._tracker.currentWidget?.sessionContext.session?.kernel;
    if (!kernel || !kernel.name.toLowerCase().includes('python')) {
      return;
    }
    const future = kernel.requestExecute({
      code: buildMatplotlibCaptureCode(
        settings.captureModeEnabled,
        settings.captureModeScale
      ),
      silent: true,
      store_history: false
    });
    await future.done;
  }

  private _app: JupyterFrontEnd;
  private _enabled = false;
  private _initialized = false;
  private _scale = DEFAULT_SETTINGS.captureModeScale;
  private _settings: SettingsController;
  private _tracker: INotebookTracker;
}

export namespace CaptureModeController {
  export interface IOptions {
    app: JupyterFrontEnd;
    tracker: INotebookTracker;
    settings: SettingsController;
  }
}
