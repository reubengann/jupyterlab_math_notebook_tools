import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ILatexTypesetter } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

import {
  CaptureModeController,
  TOGGLE_CAPTURE_MODE_COMMAND
} from './captureMode';
import { EquationHoverController } from './equationHover';
import { MathJaxSeedController } from './mathjaxSeed';
import { RenderedSearchController } from './renderedSearch';
import { SettingsController } from './settings';

const PLUGIN_ID = 'jupyterlab_math_notebook_tools:plugin';

/**
 * Initialization data for the jupyterlab_math_notebook_tools extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Rendered notebook search, equation copy actions, and MathJax macro seeding.',
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  optional: [ILatexTypesetter, ICommandPalette, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
    latexTypesetter: ILatexTypesetter | null,
    palette: ICommandPalette | null,
    translator: ITranslator | null
  ) => {
    const settings = new SettingsController({
      pluginId: PLUGIN_ID,
      registry: settingRegistry
    });
    const captureMode = new CaptureModeController({
      app,
      tracker: notebookTracker,
      settings
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
    const mathJaxSeed = latexTypesetter
      ? new MathJaxSeedController({
          tracker: notebookTracker,
          typesetter: latexTypesetter,
          settings: settings.settings
        })
      : null;

    settings.changed.connect((_, nextSettings) => {
      renderedSearch.updateSettings(nextSettings);
      mathJaxSeed?.updateSettings(nextSettings);
    });

    palette?.addItem({
      command: TOGGLE_CAPTURE_MODE_COMMAND,
      category: 'Notebook Operations'
    });
    palette?.addItem({
      command: 'math-notebook-tools:rendered-search',
      category: 'Notebook Operations'
    });

    console.log(`JupyterLab Math Notebook Tools activated: ${PLUGIN_ID}`);

    void equationHover;
    void captureMode;
    void mathJaxSeed;
  }
};

export default plugin;
