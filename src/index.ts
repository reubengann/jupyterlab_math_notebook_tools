import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ILatexTypesetter } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

import { EquationHoverController } from './equationHover';
import { MathJaxMacroController } from './mathjaxMacros';
import { RenderedSearchController } from './renderedSearch';
import { SettingsController } from './settings';

const PLUGIN_ID = 'jupyterlab_math_notebook_tools:plugin';

/**
 * Initialization data for the jupyterlab_math_notebook_tools extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Rendered notebook search, equation copy actions, and global MathJax macros.',
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
    const macros = new MathJaxMacroController({
      tracker: notebookTracker,
      typesetter: latexTypesetter
    });

    settings.changed.connect((_, nextSettings) => {
      renderedSearch.updateSettings(nextSettings);
      macros.updateSettings(nextSettings);
    });

    palette?.addItem({
      command: 'math-notebook-tools:rendered-search',
      category: 'Notebook Operations'
    });

    app.restored
      .then(() => {
        macros.updateSettings(settings.settings);
      })
      .catch(reason => {
        console.warn(
          'Unable to apply JupyterLab Math Notebook Tools settings after restore.',
          reason
        );
      });

    console.log(
      'JupyterLab extension jupyterlab_math_notebook_tools is activated!'
    );

    void equationHover;
  }
};

export default plugin;
