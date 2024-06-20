/* eslint-disable complexity */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { inspect } from 'node:util';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import Function from '../../common/function.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('listview', 'clone.listview');

export type CloneListviewResult = {
  done: boolean;
  path: string;
};

export default class CloneListview extends SfCommand<CloneListviewResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: true,
    }),
    'input-csv': Flags.file({
      summary: messages.getMessage('flags.input-csv.summary'),
      char: 'i',
      required: true,
      exists: true,
    }),
    'key-file': Flags.file({
      summary: messages.getMessage('flags.key-file.summary'),
      char: 'k',
      required: true,
      exists: true,
    }),
    'output-csv': Flags.directory({
      summary: messages.getMessage('flags.output-csv.summary'),
      char: 'r',
      required: true,
      exists: true,
    }),
    instance: Flags.custom({
      summary: messages.getMessage('flags.instance.summary'),
      char: 'u',
      required: true,
    })(),
    'skip-duplicate': Flags.boolean({
      summary: messages.getMessage('flags.skip-duplicate.summary'),
      char: 's',
      default: false
    }),
  };

  public async run(): Promise<CloneListviewResult> {
    const { flags } = await this.parse(CloneListview);

    const common = new Function(
      flags['input-csv'],
      flags['output-csv'],
      flags['name'],
      flags['key-file'],
      flags.json as boolean,
      flags['instance']
    );
    // Package location and defaults

    common.Log('Starting ListView Clone');
    common.Log('Skipping Duplicates: ' + flags['skip-duplicate']);
    common.Log('input csv: ' + flags['input-csv']);
    common.Log('output path: ' + flags['output-csv']);
    common.Log('Client Id: ' + flags['name']);
    common.Log('Key file: ' + flags['key-file']);

    // Do some magic below
   // common.Log('init playwright browser');
   // const browser = await chromium.launch();
   // const page = await browser.newPage();

    common.Log('Read input CSV file');
    const scope = common.ReadCSV();
    if (scope.input.size === 0) {
      common.Log('input CSV empty');
    }

    common.Log('Init output CSV file and log');
    if (!common.InitResultFile()) this.exit();

    // let errorMessage = 'OK';
    // const setListView: Set<string> = new Set<string>();

    // const util = require('node:util');

    let iJob: number = 0;
    const mJobs: Map<number, object>  = new Map<number, object>();
    for (const fParam of scope.input.values()) {
      iJob++;
      let bScheduled: boolean = false;
      while (!bScheduled) {
        if (mJobs.size < 10) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          mJobs.set(iJob, common.ProcessUserListView(fParam, flags['skip-duplicate']));
          bScheduled = true;
        }
        for (const job of mJobs.keys()) {
          if (!inspect(mJobs.get(job)).includes('pending')) {
            common.Log('Done');
          }
        }
        await common.Sleep(1000);
      }
    }

    // common.Log('Closing browser session');
    // await browser.close();

    common.Log('Process finished');
    common.Log('Check output csv: ' + common.outputFilePath);
    common.Log('Retry output csv: ' + common.outputRetryFilePath);
    common.Log('Done flag: ' + (common.iListViewErrorCount === 0));

    return {
      done: common.iListViewErrorCount === 0,
      path: common.outputRetryFilePath,
    };
  }
}
