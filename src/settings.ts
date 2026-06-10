import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Signal } from '@lumino/signaling';

export interface IExtensionSettings {
  renderedSearchDebounceMs: number;
}

export const DEFAULT_SETTINGS: IExtensionSettings = {
  renderedSearchDebounceMs: 150
};

export class SettingsController {
  constructor(options: SettingsController.IOptions) {
    this._pluginId = options.pluginId;
    void this._load(options.registry).catch(reason => {
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
    const renderedSearchDebounceMs =
      typeof composite.renderedSearchDebounceMs === 'number'
        ? composite.renderedSearchDebounceMs
        : DEFAULT_SETTINGS.renderedSearchDebounceMs;

    this._settings = {
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
