import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

import { EquationHoverController } from './equationHover';
import { RenderedSearchController } from './renderedSearch';
import { SettingsController } from './settings';

const PLUGIN_ID = 'jupyterlab_math_notebook_tools:plugin';

/**
 * Initialization data for the jupyterlab_math_notebook_tools extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Rendered notebook search and equation copy actions.',
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  optional: [ICommandPalette, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
    palette: ICommandPalette | null,
    translator: ITranslator | null
  ) => {
    const settings = new SettingsController({
      pluginId: PLUGIN_ID,
      registry: settingRegistry
    });
    const renderedSearch = new RenderedSearchController({
      app,
      tracker: notebookTracker,
      settings: settings.settings,
      translator
    });
    const equationHover = new EquationHoverController({
      app,
      tracker: notebookTracker,
      translator
    });

    settings.changed.connect((_, nextSettings) => {
      renderedSearch.updateSettings(nextSettings);
    });

    palette?.addItem({
      command: 'math-notebook-tools:rendered-search',
      category: 'Notebook Operations'
    });

    console.log(`JupyterLab Math Notebook Tools activated: ${PLUGIN_ID}`);

    void equationHover;
  }
};

export default plugin;
