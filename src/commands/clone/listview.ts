/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
/*
import { AuthInfo, AuthRemover, Connection, Messages, Org, SfError } from '@salesforce/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { XMLBuilder } from 'fast-xml-parser';
import { chromium } from 'playwright';
import { Package, SListView, SObject, SUser, Types } from '../../common/definition.js';
*/

import { AuthInfo, AuthRemover, Connection, Messages, Org, SfError } from '@salesforce/core';
import { chromium } from 'playwright';
import { cloneParam, cloneParamList, SListView, SObject, SUser } from '../../common/definition.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('listview', 'clone.listview');

export type CloneListviewResult = {
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
    'target-org': Flags.requiredOrg(),
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
  };

  public async run(): Promise<CloneListviewResult> {
    const { flags } = await this.parse(CloneListview);
    this.log(flags.name);

    // Package location and defaults
    const inputFilePath: string = flags['input-csv']; // '/Users/ksmeets/Projects/SDO/listviewclone.csv';
    const outputPath: string = flags['output-csv'] +'/';
    // oauth details
    const oauth2OptionsBase = {
      clientId: flags['name'], // '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      privateKeyFile: flags['key-file'] // '/Users/ksmeets/Projects/SDO/domain.key',
    };
    this.log('Staring ListView Clone');
    this.log ('input csv: ' + inputFilePath);
    this.log ('output csv: ' + outputPath);

    this.log ('Client Id: ' + flags['name']);
    this.log ('Key file: ' + flags['key-file']);

    const con = flags['target-org'].getConnection('58.0');
    const sfDomain: string = con.instanceUrl;
    const loginUrl = sfDomain + '/services/oauth2/token';
    const oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });

    this.log('Org instanceurl: ' + sfDomain);

    const org = await con.query<SObject>(
      'SELECT InstanceName, NamespacePrefix, OrganizationType, IsSandbox, Id, Name FROM Organization'
    );
    this.log('Org Id:' + org.records[0].Id);

    // Do some magic below
    this.log('init playwright browser');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const scope: cloneParamList = { input: new Map<string, cloneParam[]>(), ouput: new Map<string, cloneParam>() };
    const userWhereList: string[] = [];
    const input = readFileSync(inputFilePath);
    for (const f of input.toString().split('\n')) {
      const csvIn = f.split(',');
      if (csvIn[0] !== undefined && csvIn[1] !== undefined && csvIn[2] !== undefined) {
        const lCloneParam = { userId: csvIn[0], sObjectType: csvIn[1], listViewId: csvIn[2], listViewName: csvIn[3] };
        if (scope.input.has(csvIn[0])) {
          scope.input.get(csvIn[0])?.push(lCloneParam);
        } else {
          scope.input.set(csvIn[0], [lCloneParam]);
        }
        userWhereList.push("'" + csvIn[0] + "'");
      }
    }

    try {
        writeFileSync(outputPath + 'CloneListViewResult.csv', 'datetime,userid,sobjecttype,listViewId,listViewName,username,status\n');
    } catch (e) {
      const err = e as SfError;
      this.log(err.name + ': Can not write file');
    }


    for (const fParam of scope.input.values()) {
      this.log('Get Username for User Id: ' + fParam[0].userId);
      // const username: string = mapIdName.get(fParam[0].userId as string) as string;

      let username: string;
      try {
        const userResult = await con.query<SUser>('SELECT Id, Username FROM User where Id = \'' + fParam[0].userId + '\'');
        if (userResult.records.length === 0) {
          this.log('No Username for User Id: ' + fParam[0].userId);
          break;
        } else {
          username = userResult.records[0].Username;
        }
      } catch (e) {
        const err = e as SfError;
        this.log(err.message);
        break;
      }

      // Login as this user
      this.log('Authenticating User: ' + username);
      let authInfo: AuthInfo;

      try {
          authInfo = await AuthInfo.create({
          username,
          oauth2Options,
        });
      } catch (e) {
        const err = e as SfError;
        if (err.name === 'AuthInfoOverwriteError') {
          this.log('Removing Auth File');
          const rm = await AuthRemover.create();
          await rm.removeAuth(username);

          authInfo = await AuthInfo.create({
            username,
            oauth2Options,
          });
        } else {
          this.log('Authentication Issues');
          this.exit();
        }
        await authInfo.save();
      }
      let errorMessage: string = 'OK';
      const setListViews: Set<string> = new Set();


      this.log(new Date().toISOString() + 'Create Connection for ' + username);
      const org2: Org = await Org.create({
        connection: await Connection.create({
          authInfo,
        }),
      });
      const con2 = org2.getConnection('58.0');

      try {
        // Get existing lisviews
        const listviewResult = await con2.query<SListView>(
          "SELECT Id, Name FROM Listview where CreatedbyId = '" +
            fParam[0].userId +
            "' and sobjecttype = '" +
            fParam[0].sObjectType +
            "'"
        );
        for (const flv of listviewResult.records) {
          setListViews.add(flv.Name as string);
         // this.log('Existing Listview: ' + flv.Name);
        }
      } catch (e) {
        const err = e as SfError;
        errorMessage = err.name + ':' + err.message;
      }

      this.log(new Date().toISOString() + ' Opening playwright session ' + con2.accessToken);
      await page.goto(sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
      await page.waitForLoadState('networkidle');
      await page.setViewportSize({
        width: 1280,
        height: 960,
      });

      for (const fParam2 of fParam) {
        const lCloneParamOut: cloneParam = fParam2;
        lCloneParamOut.userName = username;
        if (setListViews.has(fParam2.listViewName as string)) {
          errorMessage = 'OK - Duplicate';
        }  {
          try {
            // go to the listview
            this.log(new Date().toISOString() + ' Navigate to ListView: ' + fParam2.listViewName + ':' + fParam2.listViewId);
            await page.goto(
              sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId
            );
            await page.waitForLoadState('networkidle');

            // Click on the clone button
            this.log(new Date().toISOString() + ' Locate gear');
            let locator;
            locator = page.locator('[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]');
            await locator.click();

            this.log(new Date().toISOString() + ' Locate clone');
            locator = page.locator('[class="slds-dropdown__item listViewSettingsMenuClone"]');
            await locator.click();

            this.log(new Date().toISOString() + ' Wait for ListView Modal View');
            await page.waitForSelector(
              'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
            );

            this.log(new Date().toISOString() + ' Locate ListView Name Field');
            locator = page.locator('[class="slds-input"]');

            this.log(new Date().toISOString() + ' Clear and Set ListView Name Field');
            await locator.last().clear();
            await locator.last().fill(fParam2.listViewName as string);

            this.log(new Date().toISOString() + ' Locate Save Button');
            const modal = page.locator('[class="modal-footer slds-modal__footer"]');
            locator = modal.locator('[type="button"]');
            await locator.last().click();

           // await page.waitForLoadState('networkidle');
           // const screenshotName = 'LV_' + fParam2.userId + '_' + fParam2.listViewId;
           // await page.screenshot({ fullPage: true, path: outputPath + screenshotName + '.png' });

          } catch (e) {
            const err = e as SfError;
            errorMessage = err.name + ':' + err.message;
            this.log(errorMessage);
            const screenshotName = 'LV_ERROR_' + fParam2.userId + '_' + fParam2.listViewId;
            await page.screenshot({ fullPage: true, path: outputPath + screenshotName + '.png' });
          }
          // datetime, userid,sobjecttype,listViewId,listViewName,username,status
          appendFileSync(outputPath + 'CloneListViewResult.csv',
            '"' +
            new Date().toISOString() + '","' +
            fParam2.userId + '","' +
            fParam2.sObjectType + '","' +
            fParam2.listViewId + '","' +
            fParam2.listViewName + '","' +
            fParam2.userName + '","' +
            errorMessage + '"\n'
          );
        }

        lCloneParamOut.Error = errorMessage;
        scope.ouput.set(fParam2.listViewId as string, lCloneParamOut);
      }

      this.log(new Date().toISOString() + ' Salesforce session Logout');
      await page.goto(
        sfDomain + '/secur/logout.jsp'
      );
      await page.waitForLoadState('networkidle');
      this.log('Salesforce session Logout complete');

     // this.log('Playwright close page')
     // await page.close();

      try {
        this.log(new Date().toISOString() + ' Removing authentication for: ' + username);
        const rm = await AuthRemover.create();
        await rm.removeAuth(username);
      } catch (e) {
        const err = e as SfError;
        this.log(err.name + ' ' + err.message);
      }
    }

    this.log('Closing browser session');
    await browser.close();

    this.log(new Date().toISOString() + ' Process finished');
    this.log('Check output csv: ' + outputPath + 'CloneListViewResult.csv' );

    return {
      path: '/Users/ksmeets/Projects/plugins/listview/src/commands/clone/listview.ts',
    };
  }
}
