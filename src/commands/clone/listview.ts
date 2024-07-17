/* eslint-disable complexity */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { inspect } from 'node:util';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { chromium } from 'playwright';
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
    validate: Flags.boolean({
      summary: messages.getMessage('flags.validate.summary'),
      char: 'v',
      default: false,
    }),
    mode: Flags.string({
      summary: messages.getMessage('flags.mode.summary'),
      char: 'm',
      required: true,
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
    common.Log('Operation Mode: ' + flags['mode']);
    common.Log('input csv: ' + flags['input-csv']);
    common.Log('output path: ' + flags['output-csv']);
    common.Log('Client Id: ' + flags['name']);
    common.Log('Key file: ' + flags['key-file']);

    // Do some magic below
    // common.Log('init playwright browser');
    // const browser = await chromium.launch();
    // const page = await browser.newPage();

    common.Log('Init output CSV file and log');
    if (!common.InitResultFile()) this.exit();
    common.WriteStatusFile();

    // let errorMessage = 'OK';
    // const setListView: Set<string> = new Set<string>();

    // const util = require('node:util');

    const browser = await chromium.launch();

    let iJob: number = 0;
    const mJobs: Map<number, object> = new Map<number, object>();
    for (const fParam of common.scope.input.values()) {
      let bScheduled: boolean = true;
      for (const fParam2 of fParam) {
        if (!bScheduled) break;
        if (fParam2.Status !== 'OK') {
          bScheduled = false;
          iJob++;
        }
      }

      while (!bScheduled) {
        if (mJobs.size < 20) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call

          switch (flags['mode']) {
            case 'clone':
              mJobs.set(iJob, common.ProcessUserListView(browser, fParam));
              break;
            case 'delete':
              mJobs.set(iJob, common.DeleteUserListView(browser, fParam));
              break;
            case 'validate':
              mJobs.set(iJob, common.ValidateUserListView(browser, fParam));
              break;
          }

          bScheduled = true;
          common.Log('Scheduled:' + iJob);
        }
        for (const job of mJobs.keys()) {
          if (!inspect(mJobs.get(job)).includes('pending')) {
            mJobs.delete(job);
            common.Log('Completed:' + job);
          }
        }
        await common.Sleep(1000);
      }
    }
    common.Log('wait for all jobs to finish');
    await Promise.all(mJobs.values());
    common.Log('All jobs finished');

    common.WriteStatusFile();

    common.Log('Closing browser session');
    await browser.close();

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
