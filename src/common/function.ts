/* eslint-disable class-methods-use-this */
/* eslint-disable no-console */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { AuthInfo, AuthRemover, Connection, SfError } from '@salesforce/core';
import { cloneParam, cloneParamList, SUser } from './definition.js';


export default class Function {
  public sfDomain: string;
  public outputPath: string;
  public outputFilePath: string;
  private inputFilePath: string;
  private outputLogFilePath: string;
  private con: Connection;
  private oauth2Options;

  public constructor(inputFilePath: string, outputPath: string, clientId: string, keyFilePath: string, con: Connection) {
    this.outputPath = outputPath + '/';
    this.inputFilePath = inputFilePath;
    this.outputFilePath = outputPath + '/CloneListViewResult.csv';
    this.outputLogFilePath = outputPath + '/CloneListViewResult.log';
    this.con = con;
    this.sfDomain = con.instanceUrl;
    // oauth details
    const oauth2OptionsBase = {
      clientId, // '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      privateKeyFile: keyFilePath // '/Users/ksmeets/Projects/SDO/domain.key',
    };
     const loginUrl = this.sfDomain + '/services/oauth2/token';
    this.oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });

  }

  public ReadCSV(): cloneParamList {
    const scope: cloneParamList = { input: new Map<string, cloneParam[]>(), ouput: new Map<string, cloneParam>() };
    const userWhereList: string[] = [];
    const input = readFileSync(this.inputFilePath);
    try {
      for (const f of input.toString().split('\n')) {

        const csvIn = f.split('\t');
        if (csvIn[0] !== undefined && csvIn[1] !== undefined && csvIn[2] !== undefined) {
          const lstatus = csvIn[4] ?? '';
          const lCloneParam = { userId: csvIn[0], sObjectType: csvIn[1], listViewId: csvIn[2], listViewName: csvIn[3].trimEnd(), status: lstatus };
          if (scope.input.has(csvIn[0])) {
            scope.input.get(csvIn[0])?.push(lCloneParam);
          } else {
            scope.input.set(csvIn[0], [lCloneParam]);
          }
          userWhereList.push("'" + csvIn[0] + "'");
        }
      }
    }
    catch (e) {
      const err = e as Error;
      console.log (err.message);
      scope.input.clear();
      scope.ouput.clear();
    }
    return scope;
  }

  public InitResultFile(): boolean {
    try {
        //  const csvResult = 'userid\tsobjecttype\tlistViewId\tlistViewName\tstatus\ttimestamp\tusername\n';
        writeFileSync(this.outputFilePath, '');
        writeFileSync(this.outputPath + '/CloneListView.log', '');

        return true;
    } catch (e)  {
      const err = e as Error;
      console.log(err.message);
      return false;
    }
  }
  public WriteResultFile(message: string): void {
    try {
      appendFileSync(this.outputFilePath, message);
    } catch (e) {
      const err = e as Error;
      console.log (err.message);
    }
  }

  public async GetUserName(userId: string): Promise<string> {
    let username: string = 'NOT FOUND';
    try {
      const userResult = await this.con.query<SUser>('SELECT Id, Username FROM User where Id = \'' + userId + '\'');
      if (userResult.records.length === 1) {
        username = userResult.records[0].Username;
      }
    } catch (e) {
      const err = e as SfError;
      console.log (err.message);
    }
    return username;
  }

  public async CreateAuthentication(username: string): Promise<AuthInfo> {
    let authInfo!: AuthInfo;

    try {
      authInfo = await AuthInfo.create({
        username,
        oauth2Options: this.oauth2Options
      });
    } catch (e) {
      const err = e as SfError;
      if (err.name === 'AuthInfoOverwriteError') {
        const rm = await AuthRemover.create();
        await rm.removeAuth(username);

        authInfo = await AuthInfo.create({
          username,
          oauth2Options: this.oauth2Options,
        });
      }
      await authInfo.save();
    }
    return authInfo;
  }

  public Log(message: string): void {
    try {
      const msg = new Date().toISOString() + ' ' + message;
      console.log (msg);
    appendFileSync(this.outputLogFilePath, msg + '\n');
    } catch (e) {
      const err = e as Error;
      console.log (err.name + ':' + err.message);
    }
  }

        /*
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
    */
}
