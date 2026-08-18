import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Signal } from '@lumino/signaling';

export interface IExtensionSettings {
  captureModeEnabled: boolean;
  captureModeScale: number;
  enableBoldVectorMacro: boolean;
  mathMacros: Record<string, unknown>;
  renderedSearchDebounceMs: number;
}

export const DEFAULT_SETTINGS: IExtensionSettings = {
  captureModeEnabled: false,
  captureModeScale: 1.25,
  enableBoldVectorMacro: false,
  mathMacros: {},
  renderedSearchDebounceMs: 150
};

export class SettingsController {
  constructor(options: SettingsController.IOptions) {
    this._pluginId = options.pluginId;
    this._ready = this._load(options.registry).catch(reason => {
      console.error(
        `JupyterLab Math Notebook Tools failed to load settings for ${this._pluginId}.`,
        reason
      );
    });
  }

  get changed(): Signal<this, IExtensionSettings> {
    return this._changed;
  }

  get settings(): IExtensionSettings {
    return this._settings;
  }

  async setCaptureModeEnabled(enabled: boolean): Promise<void> {
    await this._ready;
    if (!this._registrySettings) {
      throw new Error(`Settings failed to load for ${this._pluginId}.`);
    }
    await this._registrySettings.set('captureModeEnabled', enabled);
  }

  private async _load(registry: ISettingRegistry): Promise<void> {
    this._registrySettings = await registry.load(this._pluginId);
    this._registrySettings.changed.connect(this._onChanged, this);
    this._onChanged();
    console.log(
      `JupyterLab Math Notebook Tools settings loaded for ${this._pluginId}.`
    );
  }

  private _onChanged(): void {
    const composite = this._registrySettings?.composite ?? {};
    const captureModeEnabled =
      typeof composite.captureModeEnabled === 'boolean'
        ? composite.captureModeEnabled
        : DEFAULT_SETTINGS.captureModeEnabled;
    const captureModeScale =
      typeof composite.captureModeScale === 'number'
        ? composite.captureModeScale
        : DEFAULT_SETTINGS.captureModeScale;
    const enableBoldVectorMacro =
      typeof composite.enableBoldVectorMacro === 'boolean'
        ? composite.enableBoldVectorMacro
        : DEFAULT_SETTINGS.enableBoldVectorMacro;
    const mathMacros =
      typeof composite.mathMacros === 'object' && composite.mathMacros !== null
        ? (composite.mathMacros as Record<string, unknown>)
        : DEFAULT_SETTINGS.mathMacros;
    const renderedSearchDebounceMs =
      typeof composite.renderedSearchDebounceMs === 'number'
        ? composite.renderedSearchDebounceMs
        : DEFAULT_SETTINGS.renderedSearchDebounceMs;

    this._settings = {
      captureModeEnabled,
      captureModeScale,
      enableBoldVectorMacro,
      mathMacros,
      renderedSearchDebounceMs
    };
    this._changed.emit(this._settings);
  }

  private _changed = new Signal<this, IExtensionSettings>(this);
  private _pluginId: string;
  private _ready: Promise<void>;
  private _registrySettings: ISettingRegistry.ISettings | null = null;
  private _settings = DEFAULT_SETTINGS;
}

export namespace SettingsController {
  export interface IOptions {
    pluginId: string;
    registry: ISettingRegistry;
  }
}
