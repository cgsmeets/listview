
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { readFileSync, writeFileSync } from 'node:fs';
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

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
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
      required: false,
    }),
    'target-org': Flags.requiredOrg(),
  };

  public async run(): Promise<CloneListviewResult> {
    const { flags } = await this.parse(CloneListview);
    this.log(flags.name);

    // Package location and defaults
    const inputFilePath: string = '/Users/ksmeets/Projects/SDO/listviewclone.csv';
    const outputScreenshotPath: string = '/Users/ksmeets/Projects/';
    // oauth details
    const sfDomain: string = 'https://d0900000dzgxueax-dev-ed.develop.my.salesforce.com';
    const oauth2OptionsBase = {
      clientId: '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      clientSecret: 'F7AD40CBBD9F96161AB5416F9F122B44818C1BE57C15C7F8672B4764B8544E77',
      privateKeyFile: '/Users/ksmeets/Projects/SDO/domain.key',
    };
    const loginUrl = sfDomain + '/services/oauth2/token';
    let authInfo: AuthInfo;

    const oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });

    // Do some magic below
    this.log('init playwright browser');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const con = flags['target-org'].getConnection('58.0');
    const org = await con.query<SObject>('SELECT InstanceName, NamespacePrefix, OrganizationType, IsSandbox, Id, Name FROM Organization');
    console.log(org);

    const scope: cloneParamList = {input: new Map<string, cloneParam[]>(), ouput: new Map<string, cloneParam>()};
    const userWhereList: string[] = [];
    const input = readFileSync(inputFilePath);
    for (const f of input.toString().split('\n')) {
      const csvIn = f.split(',');
      if (csvIn[0] !== undefined && csvIn[1] !== undefined && csvIn[2] !== undefined) {
        const lCloneParam = {userId: csvIn[0], sObjectType: csvIn[1], listViewId: csvIn[2], listViewName: csvIn[3]};
        if (scope.input.has(csvIn[0])) {
          scope.input.get(csvIn[0])?.push(lCloneParam);
        }
        else  {
          scope.input.set(csvIn[0], [lCloneParam]);
        }
        userWhereList.push('\''+csvIn[0]+'\'');
      }
    }

   const mapIdName: Map<string, string> = new Map<string, string>();
   const userResult = await con.query<SUser>('SELECT Id, Username FROM User where Id in (' + userWhereList.join(',') + ')');
   for (const fUser of userResult.records) {
    mapIdName.set(fUser.Id as string, fUser.Username);
   }

    for (const fParam of scope.input.values()) {

      const username: string = mapIdName.get(fParam[0].userId as string) as string;

      // Login as this user
      this.log ('Authenticating User: ' + username);
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

         this.log('Create Connection for ' + username);
        const org2: Org = await Org.create({
          connection: await Connection.create({
            authInfo,
          }),
        });
        const con2 = org2.getConnection('58.0');

        try {

        // Get existing lisviews
        const listviewResult = await con2.query<SListView>('SELECT Id, Name FROM Listview where CreatedbyId = \'' + fParam[0].userId + '\' and sobjecttype = \'' +fParam[0].sObjectType + '\'');
        for (const flv of listviewResult.records) {
          setListViews.add(flv.Name as string);
          this.log('Existing Listview: ' + flv.Name);
        }

        this.log('Opening playwright session ' + con2.accessToken);
        await page.goto(sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
        await page.waitForLoadState('networkidle');
        await page.setViewportSize({
          width: 1280,
          height: 960,
        });
      } catch (e) {
        const err = e as SfError;
        errorMessage = err.name + ':' + err.message;
      }

      for (const fParam2 of fParam) {
        const lCloneParamOut: cloneParam = fParam2;
        lCloneParamOut.userName = username;
        if (setListViews.has(fParam2.listViewName as string)) {
          errorMessage = 'Private Listview Already Exists';
        } else {
        try {

          // go to the listview
          this.log('ListView: ' + fParam2.listViewName + ':' + fParam2.listViewId);
          await page.goto(sfDomain + '/lightning/o/' + fParam2.sObjectType +'/list?filterName=' + fParam2.listViewId);
          await page.waitForLoadState('networkidle');

          // Click on the clone button
          this.log('Navigate to gear and click clone');
          let locator;
          locator = page.locator(
            '#brandBand_1 > div > div > div > div > div.slds-page-header--object-home.slds-page-header_joined.slds-page-header_bleed.slds-page-header.slds-shrink-none.test-headerRegion.forceListViewManagerHeader > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > div > button > lightning-primitive-icon:nth-child(2)'
          );
          await locator.click();
          locator = page.locator(
            '#brandBand_1 > div > div > div > div > div.slds-page-header--object-home.slds-page-header_joined.slds-page-header_bleed.slds-page-header.slds-shrink-none.test-headerRegion.forceListViewManagerHeader > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > div > div > ul > li.slds-dropdown__item.listViewSettingsMenuClone > a > span'
          );
          await locator.click();
          await page.waitForSelector(
            'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
          );

          locator = page.locator('[class="slds-input"]');
          await locator.last().clear();
          await locator.last().fill(fParam2.listViewName as string);

          await page.waitForSelector('body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div.DESKTOP.uiModal.open.active > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div');

          // Click save
          this.log('clicking Save');
          locator = page.locator(
            'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-footer.slds-modal__footer > button.slds-button.slds-button--neutral.test-confirmButton.uiButton--default.uiButton--brand.uiButton'
          );
          await locator.click();
          await page.waitForLoadState('networkidle');
          const screenshotName = 'LV_' + fParam2.userId + '_' + fParam2.listViewId;
          await page.screenshot({fullPage: true, path: outputScreenshotPath + screenshotName + '.png'});

        } catch (e) {
          const err = e as SfError;
          errorMessage = err.name + ':' + err.message;
        }}

      lCloneParamOut.Error = errorMessage;
      scope.ouput.set(fParam2.listViewId as string,lCloneParamOut);

      }
      this.log ('Logout for: ' + username)
      await con2.logout();
    }

    await browser.close();

    const outFile: string[] = [];
    for (const fOut of scope.ouput.values()) {
      outFile.push(fOut.userId as string + ',' + fOut.listViewId + ',' + fOut.listViewName + ',' + fOut.userName + ',' + fOut.Error);
    }
    try {
      writeFileSync(inputFilePath + '.log', outFile.join('\n'));
    } catch (e) {
      const err = e as SfError;
      this.log(err.name + ': Can not write file');
      this.log(err.message);
    }

    return {
      path: '/Users/ksmeets/Projects/plugins/listview/src/commands/clone/listview.ts',
    };
  }
}