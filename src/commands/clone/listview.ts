/* eslint-disable complexity */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { AuthRemover, Connection, Messages, Org, SfError } from '@salesforce/core';
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
  };

  public async run(): Promise<CloneListviewResult> {
    const { flags } = await this.parse(CloneListview);
    // const con = flags['target-org'].getConnection('58.0');

    const common = new Function(
      flags['input-csv'],
      flags['output-csv'],
      flags['name'],
      flags['key-file'],
      flags.json as boolean,
      flags['instance']
    );
    // Package location and defaults

    common.Log('Staring ListView Clone');
    common.Log('input csv: ' + flags['input-csv']);
    common.Log('output path: ' + flags['output-csv']);
    common.Log('Client Id: ' + flags['name']);
    common.Log('Key file: ' + flags['key-file']);

    // Do some magic below
    common.Log('init playwright browser');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    common.Log('Read input CSV file');
    const scope = common.ReadCSV();
    if (scope.input.size === 0) {
      common.Log('input CSV empty');
    }

    common.Log('Init output CSV file and log');
    if (!common.InitResultFile()) this.exit();

    let errorMessage = 'OK';

    for (const fParam of scope.input.values()) {
      let username = fParam[0].userName as string;
      common.Log('Username: ' + username);

      if (username !== 'NOT FOUND') {
        try {
          errorMessage = 'OK';

          // Login as this user
          common.Log('Authenticating User: ' + username);
          const authInfo = await common.CreateAuthentication(username);

          // const setListViews: Set<string> = new Set();
          common.Log('Create Connection for: ' + username);
          const org2: Org = await Org.create({
            connection: await Connection.create({
              authInfo,
            }),
          });
          const con2 = org2.getConnection('58.0');
          common.sfDomain = con2.instanceUrl;

          common.Log('Playwright salesforce login: ' + username);
          await page.goto(common.sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
          await page.waitForLoadState('networkidle');
          await page.setViewportSize({
            width: 1280,
            height: 960,
          });
        } catch (e) {
          const err = e as SfError;
          errorMessage = err.name;
          username = 'LOGIN FAILED';
        }
      } else {
        username = 'LOGIN FAILED';
        errorMessage = 'USER NOT FOUND';
      }

      // Go to every listview and clone it
      for (const fParam2 of fParam) {
        if (username !== 'LOGIN FAILED') {
          try {
            errorMessage = 'OK';

            // go to the listview
            common.Log(
              'Navigate to ListView: ' + fParam2.sObjectType + ':' + fParam2.listViewName + ':' + fParam2.listViewId
            );
            await page.goto(
              common.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId
            );
            await page.waitForLoadState('networkidle');

            // Click on the clone button
            common.Log('Locate gear');
            let locator;
            locator = page.locator(
              '[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]'
            );
            await locator.click();

            common.Log('Locate clone');
            locator = page.locator('[class="slds-dropdown__item listViewSettingsMenuClone"]');
            await locator.click();

            common.Log('Wait for ListView Modal View');
            await page.waitForSelector(
              'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
            );

            common.Log('Locate ListView Name Field');
            locator = page.locator('[class="slds-input"]');

            common.Log('Clear and Set ListView Name Field');
            await locator.last().clear();
            await locator.last().fill(fParam2.listViewName as string);

            common.Log('Locate Save Button');
            const modal = page.locator('[class="modal-footer slds-modal__footer"]');
            locator = modal.locator('[type="button"]');
            await locator.last().click();
          } catch (e) {
            const err = e as SfError;
            errorMessage = err.name;
            common.Log(err.name + ':' + err.message);
            const screenshotName = 'LV_ERROR_' + fParam2.listViewId;
            await page.screenshot({ fullPage: true, path: common.outputPath + screenshotName + '.png' });
          }
        }

        // datetime, username,sobjecttype,listViewId,listViewName,status
        common.WriteResultFile(
          errorMessage,
          fParam2.userName +
            '\t' +
            fParam2.sObjectType +
            '\t' +
            fParam2.listViewId +
            '\t' +
            fParam2.listViewName +
            '\t' +
            errorMessage +
            '\t' +
            new Date().toISOString() +
            '\n'
        );
      }

      if (username !== 'LOGIN FAILED') {
        common.Log('Salesforce session Logout');
        await page.goto(common.sfDomain + '/secur/logout.jsp');
        // await page.waitForLoadState('networkidle');
        common.Log('Salesforce session Logout complete');
      }

      try {
        common.Log('Removing authentication for: ' + username);
        const rm = await AuthRemover.create();
        await rm.removeAuth(username);
      } catch (e) {
        const err = e as SfError;
        common.Log(err.name + ' ' + err.message);
      }
    }

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
