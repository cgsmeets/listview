/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable sf-plugin/get-connection-with-version */
import { writeFileSync, mkdirSync } from 'node:fs';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { AuthInfo, AuthRemover, Connection, Messages, Org, SfError } from '@salesforce/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { XMLBuilder } from 'fast-xml-parser';
import { listView, SListView, SUser, XmllistView } from '../../common/definition.js';


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
    const ListViewxmlns = '<ListView xmlns="http://soap.sforce.com/2006/04/metadata">';
    const lvpath1: string = 'force-app/main/default/objects/'
    const lvpath2: string = '/listViews/'

    let authInfo: AuthInfo;

    const oauth2OptionsBase = {
      clientId: '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      clientSecret: 'F7AD40CBBD9F96161AB5416F9F122B44818C1BE57C15C7F8672B4764B8544E77',
      privateKeyFile: '/Users/ksmeets/Projects/SDO/domain.key'
    };
    const loginUrl = 'https://d0900000dzgxueax-dev-ed.develop.my.salesforce.com/services/oauth2/token';

    // const oauth2Options = loginUrl ? Object.assign(oauth2OptionsBase, { loginUrl }) : oauth2OptionsBase;
    const oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });

    this.log ('starting');
    const xmloptions = {
      ignoreAttributes : false
  };

  const bxml = new XMLBuilder(xmloptions);

/*    const o: XmllistView = {ListView: {fullName: 'AAA_test', columns: ['a','b'], filterScope: 'Mine', label: 'test'}};
    const xmlo = bxml.build(o) as string;
    this.log(xmlo);
*/

    const con = flags['target-org'].getConnection();
    const objecttype: string = 'Account';

    const lvpath = lvpath1 + objecttype + lvpath2;

    mkdirSync(lvpath, { recursive: true });

    const qlistView = 'SELECT Id, Name, DeveloperName FROM ListView where SobjectType=\'' + objecttype +'\''
    this.log('build list of shared listviews for ' + objecttype);

    const setIdListView: Set<string> = new Set();
    const qrlistviews = await con.query(qlistView);
    for (const f of qrlistviews.records) {
      setIdListView.add(f.Id as string);
    }

    this.log('retrieving users')
    const users = await con.query<SUser>('SELECT ProfileId, UserType, Id, Username, LastName, FirstName, Name FROM User limit 1');

    for (const f of users.records) {
      this.log(f.Username);

      const username: string  = 'dtrump@salesforce.com.chatgpt'; // f.Username

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
        this.log('Create Connection')

        const org2: Org = await Org.create({
          connection: await Connection.create({
            authInfo})
          })
        const con2 = org2.getConnection();

        const qrlistviews2 = await con2.query<SListView>(qlistView);
        for (const f2 of qrlistviews2.records) {
          if (!setIdListView.has(f2.Id as string)) {

            const obj: listView = await con2.describe('Account/listviews/00BJ8000000TWH2MAO') as unknown as listView;

           if (obj!== undefined ) {
            const sColumns: string[] = [];
            for (const f3 of obj.columns) {
              sColumns.push(f3.label);
            }

            const objxml: XmllistView = {ListView: {fullName: f2.DeveloperName, columns: sColumns, filterScope: obj.scope, label: f2.Name as string}};;
            let xmloutput = bxml.build(objxml) as string;
            xmloutput = '<?xml version="1.0" encoding="UTF-8"?>' + '\n' + xmloutput;
            xmloutput = xmloutput.replace('<ListView>', ListViewxmlns);

            const filename = lvpath + f2.DeveloperName + '.listView-meta.xml';
            this.log(filename);

            try {
              writeFileSync(filename,xmloutput);
            }
            catch (e) {
              const err = e as SfError;
              this.log(err.name + ': Can not write file');
              this.log(err.message);

            }

          }
        }
      }
  }

    return {
      path: '/Users/ksmeets/Projects/plugins/listview/src/commands/extract/listview.ts',
    };
  }
}


