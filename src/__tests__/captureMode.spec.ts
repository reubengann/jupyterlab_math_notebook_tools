import { Signal } from '@lumino/signaling';

import {
  CaptureModeController,
  TOGGLE_CAPTURE_MODE_COMMAND,
  buildMatplotlibCaptureCode
} from '../captureMode';
import { DEFAULT_SETTINGS, IExtensionSettings } from '../settings';

jest.mock('@jupyterlab/apputils', () => ({
  CommandToolbarButton: class {
    constructor(readonly options: unknown) {}
  }
}));

describe('CaptureModeController', () => {
  afterEach(() => {
    document.documentElement.classList.remove('mnt-mod-captureMode');
    document.documentElement.style.removeProperty('--mnt-capture-scale');
  });

  it('toggles persisted state and applies capture styles', async () => {
    let command:
      | {
          execute: () => Promise<void>;
          isToggled: () => boolean;
        }
      | undefined;
    const commands = {
      addCommand: jest.fn((id, options) => {
        expect(id).toBe(TOGGLE_CAPTURE_MODE_COMMAND);
        command = options;
      }),
      notifyCommandChanged: jest.fn()
    };
    const settingsChanged = new Signal<object, IExtensionSettings>({});
    const setCaptureModeEnabled = jest.fn().mockResolvedValue(undefined);
    const settings = {
      changed: settingsChanged,
      settings: DEFAULT_SETTINGS,
      setCaptureModeEnabled
    };
    const widgetAdded = new Signal<object, never>({});

    const controller = new CaptureModeController({
      app: { commands } as never,
      tracker: {
        widgetAdded,
        forEach: jest.fn()
      } as never,
      settings: settings as never
    });

    expect(command?.isToggled()).toBe(false);
    await command?.execute();
    expect(setCaptureModeEnabled).toHaveBeenCalledWith(true);

    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      captureModeEnabled: true,
      captureModeScale: 1.5
    });

    expect(command?.isToggled()).toBe(true);
    expect(
      document.documentElement.classList.contains('mnt-mod-captureMode')
    ).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue('--mnt-capture-scale')
    ).toBe('1.5');
  });

  it('adds the shared command to notebook toolbars', () => {
    const commands = {
      addCommand: jest.fn(),
      notifyCommandChanged: jest.fn()
    };
    const widgetAdded = new Signal<object, never>({});
    const addItem = jest.fn();
    const panel = {
      toolbar: {
        names: () => [][Symbol.iterator](),
        addItem
      }
    };

    new CaptureModeController({
      app: { commands } as never,
      tracker: {
        widgetAdded,
        forEach: (callback: (value: unknown) => void) => callback(panel)
      } as never,
      settings: {
        changed: new Signal<object, IExtensionSettings>({}),
        settings: DEFAULT_SETTINGS,
        setCaptureModeEnabled: jest.fn()
      } as never
    });

    expect(addItem).toHaveBeenCalledWith('captureMode', expect.anything());
  });

  it('updates and restores Matplotlib defaults in the current Python kernel', () => {
    const requestExecute = jest.fn().mockReturnValue({
      done: Promise.resolve()
    });
    const settings = {
      changed: new Signal<object, IExtensionSettings>({}),
      settings: DEFAULT_SETTINGS,
      setCaptureModeEnabled: jest.fn()
    };
    const controller = new CaptureModeController({
      app: {
        commands: {
          addCommand: jest.fn(),
          notifyCommandChanged: jest.fn()
        }
      } as never,
      tracker: {
        widgetAdded: new Signal<object, never>({}),
        forEach: jest.fn(),
        currentWidget: {
          sessionContext: {
            session: {
              kernel: {
                name: 'python3',
                requestExecute
              }
            }
          }
        }
      } as never,
      settings: settings as never
    });

    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      captureModeEnabled: true,
      captureModeScale: 1.5
    });

    expect(requestExecute).toHaveBeenCalledWith({
      code: expect.stringContaining('value * 1.5'),
      silent: true,
      store_history: false
    });

    controller.updateSettings(DEFAULT_SETTINGS);
    expect(requestExecute).toHaveBeenLastCalledWith({
      code: expect.stringContaining(
        'delattr(_mnt_mpl, "_mnt_capture_mode_rcparams")'
      ),
      silent: true,
      store_history: false
    });
  });

  it('emits reversible Matplotlib code', () => {
    const enabled = buildMatplotlibCaptureCode(true, 1.25);
    const disabled = buildMatplotlibCaptureCode(false, 1.25);

    expect(enabled).toContain('"axes.titlesize"');
    expect(enabled).toContain('_mnt_capture_mode_rcparams');
    expect(disabled).toContain('rcParams.update(_mnt_saved)');
  });
});
