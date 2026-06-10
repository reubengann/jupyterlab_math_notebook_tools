import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Signal } from '@lumino/signaling';

export interface IExtensionSettings {
  mathMacros: Record<string, string | [string, number] | unknown[]>;
  renderedSearchDebounceMs: number;
}

export const DEFAULT_SETTINGS: IExtensionSettings = {
  mathMacros: {},
  renderedSearchDebounceMs: 150
};

export class SettingsController {
  constructor(options: SettingsController.IOptions) {
    this._pluginId = options.pluginId;
    void this._load(options.registry);
  }

  get changed(): Signal<this, IExtensionSettings> {
    return this._changed;
  }

  get settings(): IExtensionSettings {
    return this._settings;
  }

  private async _load(registry: ISettingRegistry): Promise<void> {
    this._registrySettings = await registry.load(this._pluginId);
    this._registrySettings.changed.connect(this._onChanged, this);
    this._onChanged();
  }

  private _onChanged(): void {
    const composite = this._registrySettings?.composite ?? {};
    const mathMacros =
      typeof composite.mathMacros === 'object' && composite.mathMacros !== null
        ? (composite.mathMacros as IExtensionSettings['mathMacros'])
        : DEFAULT_SETTINGS.mathMacros;
    const renderedSearchDebounceMs =
      typeof composite.renderedSearchDebounceMs === 'number'
        ? composite.renderedSearchDebounceMs
        : DEFAULT_SETTINGS.renderedSearchDebounceMs;

    this._settings = {
      mathMacros,
      renderedSearchDebounceMs
    };
    this._changed.emit(this._settings);
  }

  private _changed = new Signal<this, IExtensionSettings>(this);
  private _pluginId: string;
  private _registrySettings: ISettingRegistry.ISettings | null = null;
  private _settings = DEFAULT_SETTINGS;
}

export namespace SettingsController {
  export interface IOptions {
    pluginId: string;
    registry: ISettingRegistry;
  }
}
