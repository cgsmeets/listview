/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-console */
import { existsSync, renameSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { AuthInfo, AuthRemover, SfError, Org, Connection } from '@salesforce/core';
import { chromium } from 'playwright';
import { cloneParam, cloneParamList, SListView } from './definition.js';


export default class Function {
  public sfDomain: string;
  public outputPath: string;
  public outputFilePath: string;
  public iListViewErrorCount;
  public outputRetryFilePath: string;
  private inputFilePath: string;
  private outputLogFilePath: string;
  private oauth2Options;
  private iListViewCount;
  private iListViewTotal;
  private jsonOutput: boolean;

  public constructor(inputFilePath: string, outputPath: string, clientId: string, keyFilePath: string, jsonOutput: boolean, sfDomain: string) {
    this.outputPath = outputPath + '/';
    this.inputFilePath = inputFilePath;
    this.outputFilePath = outputPath + '/CloneListViewResult.csv';
    this.outputRetryFilePath = outputPath + '/CloneListViewRetry.csv';
    this.outputLogFilePath = outputPath + '/CloneListViewResult.log';
    this.iListViewCount = 0;
    this.iListViewErrorCount = 0;
    this.iListViewTotal = 0;
    this.jsonOutput = jsonOutput;

    this.sfDomain = sfDomain;
    // oauth details
    const oauth2OptionsBase = {
      clientId, // '3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w',
      privateKeyFile: keyFilePath // '/Users/ksmeets/Projects/SDO/domain.key',
    };
    const loginUrl = this.sfDomain + '/services/oauth2/token';
    this.oauth2Options = Object.assign(oauth2OptionsBase, { loginUrl });
    this.Log('Login Url: ' + loginUrl);
  }

  public ReadCSV(): cloneParamList {
    const scope: cloneParamList = { input: new Map<string, cloneParam[]>(), ouput: new Map<string, cloneParam>() };
    const input = readFileSync(this.inputFilePath);
    this.iListViewTotal = 0;
    try {
      for (const f of input.toString().split('\n')) {
        this.iListViewTotal++;
        const csvIn = f.split('\t');
        if (csvIn[0] !== undefined && csvIn[1] !== undefined && csvIn[2] !== undefined) {
          const lstatus = csvIn[4] ?? '';
          const lCloneParam = { userName: csvIn[0], sObjectType: csvIn[1], listViewId: csvIn[2], listViewName: csvIn[3].trimEnd(), status: lstatus };
          if (scope.input.has(csvIn[0])) {
            scope.input.get(csvIn[0])?.push(lCloneParam);
          } else {
            scope.input.set(csvIn[0], [lCloneParam]);
          }
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

  public async ProcessUserListView (Param: cloneParam[], bSkip: boolean): Promise<string> {

    this.Log('init playwright browser');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    let errorMessage;
    const setListView: Set<string> = new Set<string>();
    let username = Param[0].userName as string;
    this.Log('Username: ' + username);

    if (username !== 'NOT FOUND') {
      try {
        errorMessage = 'OK';

        // Login as this user
        this.Log('Authenticating User: ' + username);
        const authInfo = await this.CreateAuthentication(username);

        // const setListViews: Set<string> = new Set();
        this.Log('Create Connection for: ' + username);
        const org2: Org = await Org.create({
          connection: await Connection.create({
            authInfo,
          }),
        });
        const con2 = org2.getConnection('58.0');
        this.sfDomain = con2.instanceUrl;

        const lsoLV = con2.query<SListView>(
          "select Name, SobjectType from ListView where createdbyid='" + con2.userInfo?.id + "'"
        );
        for (const f of lsoLV.records) {
          setListView.add(f.SobjectType + f.Name);
        }

        this.Log('Playwright salesforce login: ' + username);
        await page.goto(this.sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
        await page.waitForLoadState('networkidle');
        await page.setViewportSize({
          width: 1280,
          height: 960,
        });
      } catch (e) {
        const err = e as SfError;
        errorMessage = err.name;
        this.Log('LOGIN FAILED: ' + err.name + ':' + err.message);
        username = 'LOGIN FAILED';
      }
    } else {
      username = 'LOGIN FAILED';
      errorMessage = 'USER NOT FOUND';
    }

    // Go to every listview and clone it
    for (const fParam2 of Param) {
      if (username !== 'LOGIN FAILED') {
        try {
          if (bSkip && setListView.has(fParam2.sObjectType + ':' + fParam2.listViewName)) {
            errorMessage = 'EXISTS';
            this.Log(
              'Skipping Existing ListView: ' +
                fParam2.sObjectType +
                ':' +
                fParam2.listViewName +
                ':' +
                fParam2.listViewId
            );
          } else {
            errorMessage = 'OK';

            // go to the listview
            this.Log(
              'Navigate to ListView: ' + fParam2.sObjectType + ':' + fParam2.listViewName + ':' + fParam2.listViewId
            );
            await page.goto(
              this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId
            );
            await page.waitForLoadState('networkidle');

            // Click on the clone button
            this.Log('Locate gear');
            let locator;
            locator = page.locator(
              '[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]'
            );
            await locator.click();

            this.Log('Locate clone');
            locator = page.locator('[class="slds-dropdown__item listViewSettingsMenuClone"]');
            await locator.click();

            this.Log('Wait for ListView Modal View');
            await page.waitForSelector(
              'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
            );

            this.Log('Locate ListView Name Field');
            locator = page.locator('[class="slds-input"]');

            this.Log('Clear and Set ListView Name Field');
            await locator.last().clear();
            await locator.last().fill(fParam2.listViewName as string);

            this.Log('Locate Save Button');
            const modal = page.locator('[class="modal-footer slds-modal__footer"]');
            locator = modal.locator('[type="button"]');
            await locator.last().click();
          }
        } catch (e) {
          const err = e as SfError;
          errorMessage = err.name;
          this.Log(err.name + ':' + err.message);
          const screenshotName = 'LV_ERROR_' + fParam2.listViewId;
          await page.screenshot({ fullPage: true, path: this.outputPath + screenshotName + '.png' });
        }
      }

      // datetime, username,sobjecttype,listViewId,listViewName,status
      this.WriteResultFile(
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
      this.Log('Salesforce session Logout');
      await page.goto(this.sfDomain + '/secur/logout.jsp');
      // await page.waitForLoadState('networkidle');
      this.Log('Salesforce session Logout complete');

      try {
        this.Log('Removing authentication for: ' + username);
        const rm = await AuthRemover.create();
        await rm.removeAuth(username);
      } catch (e) {
        const err = e as SfError;
        this.Log(err.name + ' ' + err.message);
      }
    }
    return errorMessage;
  }

  public InitResultFile(): boolean {
    try {
        //  const csvResult = 'username\tsobjecttype\tlistViewId\tlistViewName\tstatus\ttimestamp\tusername\n';

        let iSuffix = 0;
        if (existsSync(this.outputFilePath)) {
          while (existsSync(this.outputFilePath+'_'+iSuffix)) iSuffix++;
          renameSync(this.outputFilePath, this.outputFilePath+'_'+iSuffix);
        }
        iSuffix = 0;
        if (existsSync(this.outputRetryFilePath)) {
          while (existsSync(this.outputFilePath+'_'+iSuffix)) iSuffix++;
          renameSync(this.outputRetryFilePath, this.outputRetryFilePath+'_'+iSuffix);
        }
        iSuffix = 0;
        if (existsSync(this.outputLogFilePath)) {
          while (existsSync(this.outputLogFilePath+'_'+iSuffix)) iSuffix++;
          renameSync(this.outputLogFilePath, this.outputLogFilePath+'_'+iSuffix);
        }

        writeFileSync(this.outputFilePath, '');
        writeFileSync(this.outputRetryFilePath, '');
        writeFileSync(this.outputLogFilePath, '');

        return true;
    } catch (e)  {
      const err = e as Error;
      console.log(err.message);
      return false;
    }
  }
  public WriteResultFile(errormessage: string, message: string): void {
    try {
      if (errormessage === 'OK') {
        appendFileSync(this.outputFilePath, message);
        this.iListViewCount++;
      } else {
       appendFileSync(this.outputRetryFilePath, message);
       this.iListViewErrorCount++;
      }
      const msg = 'ListView Clone Status TOTAL|EXEC|OK|KO: ' +
          this.iListViewTotal + '|' +
          (this.iListViewCount + this.iListViewErrorCount) + '|' +
          this.iListViewCount + '|' +
          this.iListViewErrorCount;
      this.Log(msg);
    } catch (e) {
      const err = e as Error;
      console.log (err.message);
    }
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
        await authInfo.save();
      } else {
        this.Log ('Authentication issue: ' + err.name + ':' + err.message);
      }
    }
    return authInfo;
  }

  public Log(message: string): void {
    try {
      const msg = new Date().toISOString() + ' ' + message;
      if (!this.jsonOutput) console.log (msg);
      appendFileSync(this.outputLogFilePath, msg + '\n');
    } catch (e) {
      const err = e as Error;
      console.log (err.name + ':' + err.message);
    }
  }

}


