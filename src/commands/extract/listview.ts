/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { writeFileSync } from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { AuthInfo, AuthRemover, Connection, Messages, Org, SfError } from '@salesforce/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { XMLBuilder } from 'fast-xml-parser';
import { chromium } from 'playwright';
import { Package, SListView, SUser, Types } from '../../common/definition.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('listview', 'extract.listview');

export type ExtractListviewResult = {
  path: string;
};

export default class ExtractListview extends SfCommand<ExtractListviewResult> {
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

  public async run(): Promise<ExtractListviewResult> {
    const { flags } = await this.parse(ExtractListview);
    // Set the object type
    const objecttype: string = 'Account';

    // Package xml only
    const packagexmlonly: boolean = true;

    // Package location and defaults
    const packagepath = '/Users/ksmeets/Projects/Package.xml';

    const sfDomain: string = 'https://d0900000dzgxueax-dev-ed.develop.my.salesforce.com';

    // oauth details
    const oauth2OptionsBase = {
      clientId: '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      clientSecret: 'F7AD40CBBD9F96161AB5416F9F122B44818C1BE57C15C7F8672B4764B8544E77',
      privateKeyFile: '/Users/ksmeets/Projects/SDO/domain.key'
    };

    // User Scope
    const qUsers = 'SELECT ProfileId, UserType, Id, Username, LastName, FirstName, Name FROM User limit 1';

    // Other defaults
    const loginUrl = sfDomain + '/services/oauth2/token';
    const qlistView = 'SELECT Id, Name, DeveloperName, NamespacePrefix FROM ListView where SobjectType=\'' + objecttype +'\''
    const ListViewxmlns = '<ListView xmlns="http://soap.sforce.com/2006/04/metadata">';
    const xmloptions = {
      ignoreAttributes : false
    };
    const bxml = new XMLBuilder(xmloptions);

    const oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });

    // Do some magic below
    this.log ('init playwright browser');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    this.log ('starting process for ' + objecttype);
    const con = flags['target-org'].getConnection();

    const setIdListView: Set<string> = new Set();
    const qrlistviews = await con.query(qlistView);
    for (const f of qrlistviews.records) {
      setIdListView.add(f.Id as string);
    }

    this.log('retrieving users`')
    const users = await con.query<SUser>(qUsers);
    let authInfo: AuthInfo;

    for (const f of users.records) {
      this.log('Processing User:' + f.Username);

      // TEST ONLY - SET username to f.Username for this to run as the users per the query above
      const username: string  = 'dtrump@salesforce.com.chatgpt'; // f.Username

      const o = await con.metadata.upsert('Group',{fullName: 'CGT_' + f.Id, name: f.Username , doesIncludeBosses: false});
      this.log (o.success + ':' + o.fullName);
      console.log (o);

      // WIP - need to add the user to the group
      // const o2 = await con.insert('GroupMember',{});

        this.log ('Authenticating user: ' + f.Username);
        try {
          authInfo = await AuthInfo.create({
          username,
          oauth2Options,
        });
        } catch(e) {
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
        this.log('Create Connection for ' + f.Username)
        const org2: Org = await Org.create({
          connection: await Connection.create({
            authInfo})
          })
        const con2 = org2.getConnection();

        this.log('Connection token: ' + con2.accessToken);

        if (!packagexmlonly) {
          this.log ('Open salesforce on playwright')
          await page.goto(sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
          await page.waitForLoadState('networkidle');
          await page.setViewportSize({
            width: 1280,
            height: 960,
          });
        }

        const packagetypes: Types = {name: 'ListView', members: []};

        const qrlistviews2 = await con2.query<SListView>(qlistView);
        for (const f2 of qrlistviews2.records) {
          if (!setIdListView.has(f2.Id as string)) {

            const CGTListviewAPIName = 'CGT_' + f2.Id +'_' + f.Id;
            packagetypes.members.push(objecttype.toUpperCase() + '.' + CGTListviewAPIName);

            if (!packagexmlonly) {

              await page.goto(sfDomain + '/lightning/o/Account/list?filterName=' + f2.Id);
              await page.waitForLoadState('networkidle');
              this.log('ListView page: ' + f2.Name);

              let locator;
              locator = page.locator('#brandBand_1 > div > div > div > div > div.slds-page-header--object-home.slds-page-header_joined.slds-page-header_bleed.slds-page-header.slds-shrink-none.test-headerRegion.forceListViewManagerHeader > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > div > button > lightning-primitive-icon:nth-child(2)');
              console.log(locator);
              await locator.click();
              locator = page.locator('#brandBand_1 > div > div > div > div > div.slds-page-header--object-home.slds-page-header_joined.slds-page-header_bleed.slds-page-header.slds-shrink-none.test-headerRegion.forceListViewManagerHeader > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > div > div > ul > li.slds-dropdown__item.listViewSettingsMenuClone > a > span');
              await locator.click();
              await page.waitForSelector('body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header');

              this.log ('Setting the clone List Name and API Name');
              locator = page.locator('#input-187');
              await locator.clear();
              await locator.fill(f2.Name as string);

              locator = page.locator('#input-188');
              await locator.clear();
              await locator.fill(CGTListviewAPIName);

              this.log ('Setting the All Users see this list view');
              locator = page.locator('#radio-193').locator('..');
              await locator.click();

              this.log ('clicking Save');
              locator = page.locator('body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-footer.slds-modal__footer > button.slds-button.slds-button--neutral.test-confirmButton.uiButton--default.uiButton--brand.uiButton');
              await locator.click();
              await page.waitForLoadState('networkidle');

              // await page.screenshot({fullPage: true, path: '/Users/ksmeets/Projects/test1.png'});

            }
            const lvName = f2.NamespacePrefix ? objecttype.toUpperCase() + '.' + f2.NamespacePrefix + '__' + CGTListviewAPIName : objecttype.toUpperCase() + '.' + CGTListviewAPIName;
            this.log (lvName);
            const oListView = await con.metadata.read('ListView', lvName);
            oListView.sharedTo = {group: ['CGT_'+ f.Id], groups: [],channelProgramGroup:[],guestUser:[],channelProgramGroups:[], managerSubordinates: [], managers: [], portalRole:[], portalRoleAndSubordinates : [], queue : [], role :[], roleAndSubordinates: [], roleAndSubordinatesInternal: [], roles: [], rolesAndSubordinates:[], territories: [],territoriesAndSubordinates: [], territory: [], territoryAndSubordinates: []};

            const o2 = await con.metadata.update('ListView', oListView);
            this.log (o2.success + ':' + o2.fullName);
          }

        }
        await browser.close();

        const packagexml: Package = {Package: {types: packagetypes, version: '58.0'}};
        let xmloutput = bxml.build(packagexml) as string;
        xmloutput = '<?xml version="1.0" encoding="UTF-8"?>' + '\n' + xmloutput;
        xmloutput = xmloutput.replace('<ListView>', ListViewxmlns);
        const filename = packagepath;
        this.log(filename);

        try {
          writeFileSync(filename,xmloutput);
        }
        catch (e) {
          const err = e as SfError;
          this.log(err.name + ': Can not write file');
          this.log(err.message);

        }
        this.log ('User done:' + f.Username);

      }

    return {
      path: '/Users/ksmeets/Projects/plugins/listview/src/commands/extract/listview.ts',
    };
  }
}


