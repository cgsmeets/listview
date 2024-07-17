/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-console */
import { existsSync, renameSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { AuthInfo, AuthRemover, SfError, Org, Connection } from '@salesforce/core';
import { Browser } from 'playwright';
import { cloneParam, cloneParamList } from './definition.js';


export default class Function {
  public sfDomain: string;
  public outputPath: string;
  public outputFilePath: string;
  public iListViewErrorCount;
  public outputRetryFilePath: string;
  public scope: cloneParamList;
  public iListViewCount;
  public iListViewTotal;
  private inputFilePath: string;
  private outputLogFilePath: string;
  private oauth2Options;
  private jsonOutput: boolean;
  private MapSelector: Map<string, string>;

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
    this.scope = this.ReadCSV();

    this.MapSelector = new Map<string,string>(
			[
				['Assortment','standard'],
				['cgcloud__Batch_Run_Status__c','standard'],
				['cgcloud__Condition_Template__c','standard'],
				['cgcloud__Fund__c','standard'],
				['cgcloud__Fund_Template__c','standard'],
				['cgcloud__Fund_Transaction_Header__c','standard'],
				['cgcloud__Fund_Transaction_Template__c','standard'],
				['cgcloud__KPI_Definition__c','standard'],
				['cgcloud__Payment__c','standard'],
				['cgcloud__Payment_Template__c','standard'],
				['cgcloud__Promotion__c','standard'],
				['cgcloud__Promotion_Template__c','standard'],
				['cgcloud__Promotion_Template_Tactic_Template__c','standard'],
				['cgcloud__Rate_Based_Funding__c','standard'],
				['cgcloud__RTR_Report_Configuration__c','standard'],
				['cgcloud__Sales_Organization__c','standard'],
				['cgcloud__Tactic__c','standard'],
				['cgcloud__Tactic_Product_Condition__c','standard'],
				['cgcloud__User_Setting__c','standard'],
				['CGT_Approval_Threshold__c','standard'],
				['CGT_Broadcast__c','standard'],
				['CGT_Cannibalisation_Rate__c','standard'],
				['CGT_Delivery_Profile__c','standard'],
				['CGT_FundStaging__c','standard'],
				['CGT_FundStagingUpload__c','standard'],
				['CGT_FundTransactionStagingUpload__c','standard'],
				['CGT_RateBasedFundingStage__c','standard'],
				['CGT_StandardReport__c','standard'],
				['CGT_UserCustomerProduct__c','standard'],
				['Product2','standard'],
			]);


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
        const csvIn = f.split('\t');
        if (csvIn[0] !== undefined && csvIn[1] !== undefined && csvIn[2] !== undefined) {
          const lstatus = csvIn[4] ?? 'NEW';
          if (lstatus!=='OK') this.iListViewTotal++;
          const lCloneParam = { userName: csvIn[0], sObjectType: csvIn[1], listViewId: csvIn[2], listViewName: csvIn[3].trimEnd(), Status: lstatus, Error: '' };
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
      this.Log (err.message);
      scope.input.clear();
      scope.ouput.clear();
    }
    return scope;
  }

  public async Sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  public async dummy(Param: cloneParam[]): Promise<string> {
    // eslint-disable-next-line no-param-reassign
    Param[0].Status = 'RETRY';
   await this.Sleep(10);

    if ( (this.GetSelector('test')) === 'custom') {
      console.log ('BAD ');

    }
    else {
      console.log('GOED');
    }
    return '';
  }
  public async LoginJWT(username: string): Promise<Connection|undefined> {
    let con;
    try {
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
       con = org2.getConnection('58.0');
       return con;
    }
    catch(e) {
      const err = e as SfError;
      this.Log('JWT ERROR:' + err.message)
    }
    return undefined;
  }
  public async DeleteUserListView (browser: Browser, Param: cloneParam[]): Promise<string> {

    this.Log('init playwright browser');
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);

    const username = Param[0].userName as string;
    this.Log('Username: ' + username);
    try {

      const con2 = await this.LoginJWT(username);
      if (con2 === undefined) throw (new Error('JWT Error'));
      this.sfDomain = con2.instanceUrl;

      const userId = (await con2.identity()).user_id;
      this.Log(Param[0].userName + ':' + userId);

      this.Log('Playwright salesforce login: ' + username);
      await page.goto(this.sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
      await page.waitForLoadState('networkidle');
      await page.setViewportSize({
        width: 1280,
        height: 960,
      });

      // Go to every listview and clone it
      for (const fParam2 of Param) {
         if (fParam2.Status !== 'OK') {
          try {
            this.Log('DELETE LV:' + fParam2.sObjectType + ':' + fParam2.listViewName);
          {
              // go to the listview
              this.Log( 'Navigate to ListView: ' + this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId);
              await page.goto(
                this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId
              );
              await page.waitForLoadState('networkidle');

              let locator;
             {
                  // Click on the clone button
                  this.Log('Standard Object Locate gear');
                  locator = page.locator(
                    '[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]'
                  );
                  await locator.click();
                  await page.waitForLoadState('networkidle');


                  this.Log('Standard Object Locate delete');
                  locator = page.locator('[class="slds-dropdown__item listViewSettingsMenuDelete"]');
                  await locator.click();

                  this.Log('Standard Object Wait for ListView Modal View');
                  await page.waitForSelector(
                    'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div.DESKTOP.uiModal.open.active > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div'
                   // 'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
                  );

                 // this.Log('Standard Object Locate ListView Name Field');
                 // locator = page.locator('[class="slds-input"]');

                 // this.Log('Standard Object Clear and Set ListView Name Field');
                 // await locator.last().clear();
                 // await locator.last().fill(fParam2.listViewName as string);

                  this.Log('Standard Object Locate Delete Button');
                  const modal = page.locator('[class="modal-footer slds-modal__footer"]');
                  locator = modal.locator('[type="button"]');
                  await locator.last().click();

                  this.Log('Standard Object Wait for popup to disappear');
                  await page.waitForSelector('[class="modal-container slds-modal__container"]', { state: 'detached' });

                //  const screenshotName = 'LV_DELETE_' + fParam2.listViewId;
                //  await page.screenshot({ fullPage: true, path: this.outputPath + screenshotName + '.png' });

              }
            }
            this.iListViewCount++;
            fParam2.Status = 'OK';
            fParam2.Error = '';


          } catch (e) {
            const err = e as SfError;
            this.iListViewErrorCount++;
            fParam2.Status = 'RETRY';
            fParam2.Error =  err.name + ':' + err.message;
            this.Log('INNER ERROR for user ' + Param[0].userName + ':' + err.name + ':' + err.message);
            this.WriteRetryFile(fParam2);
          }
        }
        this.WriteStatusFile();
      }

      try {
          this.Log('Salesforce session Logout');
          await page.goto(this.sfDomain + '/secur/logout.jsp');
          await page.waitForLoadState('networkidle');
          this.Log('Salesforce session Logout complete');

          this.Log('Removing authentication for: ' + username);
          const rm = await AuthRemover.create();
          await rm.removeAuth(username);
        } catch (e) {
          const err = e as SfError;
          this.Log(err.name + ' ' + err.message);
      }

      await page.close();

    } catch (e) {
     const err = e as SfError;
     for (const fParam2 of Param) {
      if (fParam2.Status !=='OK') {
        this.iListViewErrorCount++;
        fParam2.Error =  err.name + ':' + err.message;
        fParam2.Status = 'RETRY';
        this.WriteRetryFile(fParam2);
      }
    }
    this.Log('OUTER ERROR for user ' + Param[0].userName + ':' + err.name + ':' + err.message);
  }

  this.WriteStatusFile();
  return 'OK';
  }


  public async ValidateUserListView (browser: Browser, Param: cloneParam[]): Promise<string> {

  //  const setListView: Set<string> = new Set<string>();
    const username = Param[0].userName as string;
    this.Log('Username: ' + username);
    try {

      const con2 = await this.LoginJWT(username);
      if (con2 === undefined) throw (new Error('JWT Error'));
      this.sfDomain = con2.instanceUrl;

      const userId = (await con2.identity()).user_id;
      this.Log(Param[0].userName + ':' + userId);


      for (const fParam2 of Param) {
          try {
            this.Log( 'Validate ListView: ' + this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId);
            const lvResult = await con2.query('SELECT Id, Name, DeveloperName, NamespacePrefix, SobjectType, IsSoqlCompatible, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp, LastViewedDate, LastReferencedDate \
                                        FROM ListView where createdbyid = ' + '\'' + userId + '\'' +
                                        ' AND SobjectType = ' + '\'' + fParam2.sObjectType + '\'' +
                                        ' AND Name = ' + '\'' + fParam2.listViewName?.replace(/[\\$'"]/g, '\\$&') + '\'' +
                                        ' ORDER BY CREATEDDATE DESC'
                                      );

            if (lvResult.records.length === 0) {
              this.iListViewErrorCount++;
              fParam2.Status='ERR';
              fParam2.Error='NO LISTVIEW FOUND';
            }

            if (lvResult.records.length === 2) {
              this.iListViewErrorCount++;
              fParam2.Status='ERR';
              fParam2.Error='DUPLICATE LISTVIEWS FOUND';
              for (const flv of lvResult.records) {
                fParam2.Error += '\t' + flv.Id;
              }

            }
            if (lvResult.records.length > 2) {
              this.iListViewErrorCount++;
              fParam2.Status='ERR';
              fParam2.Error='MULTIPLE LISTVIEWS FOUND';
              for (const flv of lvResult.records) {
                fParam2.Error += '\t' + flv.Id;
              }
            }

            if (lvResult.records.length === 1) {
              this.iListViewCount++;
              fParam2.Status='VAL';
              fParam2.Error='VALIDATE OK\t' + lvResult.records[0].Id;
            }
            this.Log(fParam2.Status + ' : ' + fParam2.Error);
          } catch (e) {
            const err = e as SfError;
            fParam2.Status = 'ERR';
            fParam2.Error =  err.name + ':' + err.message;


          }
          this.WriteStatusFile();
      }

    } catch (e) {
      const err = e as SfError;
      for (const fParam2 of Param) {
       if (fParam2.Status !=='OK') {
         this.iListViewErrorCount++;
         fParam2.Error =  err.name + ':' + err.message;
         fParam2.Status = 'ERR';
         this.WriteRetryFile(fParam2);
       }
     }
     this.Log('OUTER ERROR for user ' + Param[0].userName + ':' + err.name + ':' + err.message);
   }
    return 'OK';

  }

  public GetSelector(sobjecttype: string): string {

    // custom    '[class="test-listViewSettingsMenu slds-m-left_xx-small"]'
    // standard  '[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]'
      return this.MapSelector.get(sobjecttype) as string;
  }

  public async ProcessUserListView (browser: Browser, Param: cloneParam[]): Promise<string> {

    this.Log('init playwright browser');
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    const username = Param[0].userName as string;
    this.Log('Username: ' + username);
    try {

      const con2 = await this.LoginJWT(username);
      if (con2 === undefined) throw (new Error('JWT Error'));
      this.sfDomain = con2.instanceUrl;

      const userId = (await con2.identity()).user_id;
      this.Log(Param[0].userName + ':' + userId);

      this.Log('Playwright salesforce login: ' + username);
      await page.goto(this.sfDomain + '/secur/frontdoor.jsp?sid=' + con2.accessToken);
      await page.waitForLoadState('networkidle');
      await page.setViewportSize({
        width: 1280,
        height: 960,
      });

      // Go to every listview and clone it
      for (const fParam2 of Param) {
         if (fParam2.Status !== 'OK') {
          try {
            this.Log('LV:' + fParam2.sObjectType + ':' + fParam2.listViewName);

              // go to the listview
              this.Log( 'Navigate to ListView: ' + this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId);
              await page.goto(
                this.sfDomain + '/lightning/o/' + fParam2.sObjectType + '/list?filterName=' + fParam2.listViewId
              );
              await page.waitForLoadState('networkidle');

              let locator;
              if (this.GetSelector(fParam2.sObjectType as string) === 'custom') {

                this.Log('Custom Object Locate gear');
                locator = page.locator(
                  '[class="test-listViewSettingsMenu slds-m-left_xx-small"]'
                );
                await locator.click();

                this.Log('Custom Object Locate clone');
                locator = await page.waitForSelector("//div[contains(@class, 'test-listViewSettingsMenu') and contains(@class, 'slds-m-left_xx-small')]//lightning-menu-item[2]");
                await locator.click();

                this.Log('Custom Object Wait for ListView Modal View');
                await page.waitForSelector('[class="slds-modal__title slds-hyphenate"]');
                const modal = page.locator('lightning-modal');

                this.Log('Custom Object Locate ListView Name Field');
                locator = modal.locator('lightning-input').first().locator('input');
                await locator.clear();
                await locator.fill(fParam2.listViewName as string);

                this.Log('Custom Object Locate Save Button');
                locator = modal.locator('lightning-modal-footer').locator('[type="button"]');
                await locator.last().click();

                this.Log('Custom Object Wait for popup to disappear');
                await page.waitForSelector('lightning-modal', { state: 'detached' });

              } else {
                  // Click on the clone button
                  this.Log('Standard Object Locate gear');
                  locator = page.locator(
                    '[class="test-listViewSettingsMenu slds-m-left_xx-small forceListViewSettingsMenu"]'
                  );
                  await locator.click();

                  this.Log('Standard Object Locate clone');
                  locator = page.locator('[class="slds-dropdown__item listViewSettingsMenuClone"]');
                  await locator.click();

                  this.Log('Standard Object Wait for ListView Modal View');
                  await page.waitForSelector(
                    'body > div.desktop.container.forceStyle.oneOne.navexDesktopLayoutContainer.lafAppLayoutHost.forceAccess.tablet > div.DESKTOP.uiContainerManager > div > div.panel.slds-modal.test-forceListViewSettingsDetail.slds-fade-in-open > div > div.modal-header.slds-modal__header'
                  );

                  this.Log('Standard Object Locate ListView Name Field');
                  locator = page.locator('[class="slds-input"]');

                  this.Log('Standard Object Clear and Set ListView Name Field');
                  await locator.last().clear();
                  await locator.last().fill(fParam2.listViewName as string);

                  this.Log('Standard Object Locate Save Button');
                  const modal = page.locator('[class="modal-footer slds-modal__footer"]');
                  locator = modal.locator('[type="button"]');
                  await locator.last().click();

                  this.Log('Standard Object Wait for popup to disappear');
                  await page.waitForSelector('[class="modal-container slds-modal__container"]', { state: 'detached' });
              }

              const lvResult = await con2.query('SELECT Id \
                FROM ListView where createdbyid = ' + '\'' + userId + '\'' +
                ' AND SobjectType = ' + '\'' + fParam2.sObjectType + '\'' +
                ' AND Name = ' + '\'' + fParam2.listViewName?.replace(/[\\$'"]/g, '\\$&') + '\'' +
                ' ORDER BY CREATEDDATE DESC LIMIT 1');
                if (lvResult.totalSize === 1) fParam2.Error = lvResult.records[0].Id;
                else fParam2.Error = 'ID NOT FOUND';

                this.iListViewCount++;
                fParam2.Status = 'OK';

          } catch (e) {
            const err = e as SfError;
            this.iListViewErrorCount++;
            fParam2.Status = 'RETRY';
            fParam2.Error =  err.name + ':' + err.message;
            this.Log('INNER ERROR for user ' + Param[0].userName + ':' + err.name + ':' + err.message);
            this.WriteRetryFile(fParam2);
            const screenshotName = 'LV_LOGIN_' + fParam2.listViewId;
            await page.screenshot({ fullPage: true, path: this.outputPath + screenshotName + '.png' });

          }
        }
        this.WriteStatusFile();
      }

      try {
          this.Log('Salesforce session Logout');
          await page.goto(this.sfDomain + '/secur/logout.jsp');
          await page.waitForLoadState('networkidle');
          this.Log('Salesforce session Logout complete');

          this.Log('Removing authentication for: ' + username);
          const rm = await AuthRemover.create();
          await rm.removeAuth(username);
        } catch (e) {
          const err = e as SfError;
          this.Log(err.name + ' ' + err.message);
      }

      await page.close();

    } catch (e) {
     const err = e as SfError;
     for (const fParam2 of Param) {
      if (fParam2.Status !=='OK') {
        this.iListViewErrorCount++;
        fParam2.Error =  err.name + ':' + err.message;
        fParam2.Status = 'RETRY';
        this.WriteRetryFile(fParam2);
      }
    }
    this.Log('OUTER ERROR for user ' + Param[0].userName + ':' + err.name + ':' + err.message);
  }

  this.WriteStatusFile();
  return 'OK';
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

  public WriteStatusFile(): void {
    const output: string[] = [];
    for (const f of this.scope.input.values()) {
      for (const f2 of f) {
        output.push(
        f2.userName + '\t' +
        f2.sObjectType + '\t' +
        f2.listViewId + '\t' +
        f2.listViewName + '\t' +
        f2.Status + '\t' +
        new Date().toISOString() + '\t' +
        f2.Error?.replaceAll(/(\r\n|\n|\r)/gm,'') + '\t'

      );
      }
    }
    writeFileSync(this.outputFilePath, output.join('\n'));

    const msg = 'ListView Clone Status TOTAL|EXEC|OK|KO: ' +
    this.iListViewTotal + '|' +
    (this.iListViewCount + this.iListViewErrorCount) + '|' +
    this.iListViewCount + '|' +
    this.iListViewErrorCount;
    this.Log(msg);
  }

  public WriteRetryFile(fParam2: cloneParam): void {
    try {

        const message =
        fParam2.userName + '\t' +
        fParam2.sObjectType + '\t' +
        fParam2.listViewId + '\t' +
        fParam2.listViewName + '\t' +
        fParam2.Status +'\t' +
        new Date().toISOString() + '\n'

       appendFileSync(this.outputRetryFilePath, message);
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


