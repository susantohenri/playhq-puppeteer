import path from 'path';
import xlsxPopulate from 'xlsx-populate';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Dropbox } from 'dropbox';
import * as fs from 'fs';
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, DeleteRuleCommand, RemoveTargetsCommand } from "@aws-sdk/client-eventbridge";
import { LambdaClient, AddPermissionCommand } from "@aws-sdk/client-lambda";

const eventbridge = new EventBridgeClient({});
const lambda = new LambdaClient({});

export const handler = async (event) => {
  try {
    const { url, cronExpr } = await getUrlAndNextSchedule()
    const [names, data] = await Promise.all([
      readPlayerNames(),
      pullPlayerData(`https://www.playhq.com${url}`)
    ]);
    let players = names.map(name => {
      return { ...data.find(obj => obj.name === name), name };
    });
    await writeXlsx(players);
    await uploadToSharePoint(); // await uploadFile();
    await scheduleNextRun(cronExpr);
    const response = {
      statusCode: 200,
      body: true,
    };
    return response;
  } catch (error) {
    console.error('handler', error);
    throw error;
  }
};

async function getUrlAndNextSchedule() {
  try {
    const browser = await puppeteer.launch({
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      args: [...chromium.args,
        '--single-process',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-animations',
        '--disable-smooth-scrolling',
        '--disable-background-timer-throttling',
        '--disable-setuid-sandbox'
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36`);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, `webdriver`, { get: () => undefined });
    });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      if (['image', 'stylesheet', 'font', 'svg'].includes(resourceType)) {
        request.abort();
      } else if (!url.includes('playhq.com')) {
        request.abort();
      } else {
        request.continue();
      }
    });
    await page.goto(`https://www.playhq.com/basketball-victoria/org/sandringham-sabres-basketball-club/f321d4fc/victorian-junior-basketball-league-2025/teams/sandringham-u14-boys-7/e9fc439b`, {
      waitUntil: `domcontentloaded`,
      timeout: 30000
    });

    // get url
    await page.waitForFunction(() => {
      return document.querySelectorAll(`a[data-testid^="fixture-button"]`)[0]
    }, { timeout: 30000 });
    const url = await page.evaluate(() => {
      return document.querySelectorAll(`a[data-testid^="fixture-button"]`)[0].getAttribute(`href`)
    })

    // get next schedule
    await page.waitForFunction(() => {
      return document.querySelectorAll('[name="calendar-empty"]')[1]
        .parentElement.nextElementSibling.querySelector('span')
    }, { timeout: 30000 });
    const cronExpr = await page.evaluate(() => {
      const element = document.querySelectorAll('[name="calendar-empty"]')[1];
      const parent = element.parentElement;
      const sibling = parent.nextElementSibling;
      const span = sibling.querySelector("span");
      const match = span.textContent.match(/(\d{2}):(\d{2})\s(AM|PM),\s\w+,\s(\d{2})\s(\w+)\s(\d{2})/);

      let [_, hour, minutes, period, day, monthText, year] = match;

      hour = parseInt(hour, 10);
      minutes = parseInt(minutes, 10);
      year = parseInt("20" + year, 10); // Convert YY to YYYY

      if (period === "PM" && hour !== 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;

      const monthMap = {
        "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
        "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
      };
      const month = monthMap[monthText];

      let date = new Date(Date.UTC(year, month - 1, day, hour, minutes));
      date.setHours(date.getHours() - 11);

      const cronExpr = `cron(${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} ? ${date.getUTCFullYear()})`;

      return cronExpr;
    })

    browser.close()
    return { url, cronExpr };
  } catch (error) {
    console.error('getUrlAndNextSchedule', error);
    throw error;
  }
}

async function readPlayerNames() {
  try {
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const filePath = path.join(currentDir, 'template.xlsx');
    const workbook = await xlsxPopulate.fromFileAsync(filePath);
    const sheet = workbook.sheet(`Template`);
    let row = 2;
    const names = [];
    while (true) {
      const name = sheet.cell(`B${row}`).value();
      row++;
      if (undefined === name) break;
      else names.push(name.replace(String.fromCharCode(160), String.fromCharCode(32)))
    }
    return names;
  } catch (error) {
    console.error('readPlayerNames', error);
    throw error;
  }
}

async function pullPlayerData(url) {
  const browser = await puppeteer.launch({
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
    args: [...chromium.args,
      '--single-process',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-animations',
      '--disable-smooth-scrolling',
      '--disable-background-timer-throttling',
      '--disable-setuid-sandbox'
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36`);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, `webdriver`, { get: () => undefined });
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const resourceType = request.resourceType();
    const url = request.url();
    if (['image', 'stylesheet', 'font', 'svg'].includes(resourceType)) {
      request.abort();
    } else if (!url.includes('playhq.com')) {
      request.abort();
    } else {
      request.continue();
    }
  });
  await page.goto(url, {
    waitUntil: `domcontentloaded`,
    timeout: 10000
  });

  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find(btn =>
      btn.querySelector('span:last-child')?.textContent.trim() === "Show advanced stats"
    )
    return button && typeof button.onclick === 'function';
  }, { timeout: 30000 });

  const data = await page.evaluate(() => {
    const data = [];
    Array.from(document.querySelectorAll('button')).find(btn =>
      btn.querySelector('span:last-child')?.textContent.trim() === "Show advanced stats"
    ).click()
    document.querySelectorAll(`tr[data-testid]`).forEach(row => {
      const cells = row.cells
      data.push({
        "#": cells[0].querySelector(`div`).textContent.trim(),
        "name": cells[1].querySelector(`div a span`).textContent.trim(),
        "1PT": cells[3].textContent.trim(),
        "2PT": cells[4].textContent.trim(),
        "3PT": cells[5].textContent.trim(),
        "F": cells[6].textContent.trim(),
      })
    });
    return data;
  })
  await browser.close();
  return data;
}

async function writeXlsx(players) {
  try {
    const workbook = await xlsxPopulate.fromFileAsync(`template.xlsx`);
    const sheet = workbook.sheet(`Template`);

    let row = 2;
    players.forEach(player => {
      sheet.cell(`A${row}`).value(player[`#`]);
      sheet.cell(`B${row}`).value(player['name']);
      sheet.cell(`M${row}`).value(player['1PT']);
      sheet.cell(`N${row}`).value(player['2PT']);
      sheet.cell(`O${row}`).value(player['3PT']);
      sheet.cell(`Q${row}`).value(player['F']);
      row++;
    })

    await workbook.toFileAsync(`/tmp/result.xlsx`);
  } catch (error) {
    console.error('writeXlsx', error);
    throw error;
  }
}

async function uploadFile() {
  try {
    const contents = fs.readFileSync(`/tmp/result.xlsx`);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const path = `/playhq_${year}-${month}-${day}_${hour}-${minute}-${second}.xlsx`;

    const uploadParams = {
      contents,
      path,
      mode: 'overwrite',
      autorename: true,
      mute: false
    };

    const dbx = new Dropbox({ accessToken: await dropboxAccessToken() });
    return await dbx.filesUpload(uploadParams);
  } catch (error) {
    console.error('uploadFile', error.message);
    throw error;
  }
}

async function dropboxAccessToken() {
  /*
      1. open this link to get AUTHORIZATION_CODE:
          https://www.dropbox.com/oauth2/authorize?client_id=vr33naiand0vmk8&token_access_type=offline&response_type=code
      2. run following curl to get refresh token
          curl -X POST https://api.dropbox.com/oauth2/token \
              -d grant_type=authorization_code \
              -d code=AUTHORIZATION_CODE \
              -u vr33naiand0vmk8:3q8eer02z75j3xp
  */
  try {
    const auth = btoa(`vr33naiand0vmk8:3q8eer02z75j3xp`);
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: 'r1Em3ZtZ_IgAAAAAAAAAASMncdY-uco3OJ0Dzsz8lAQbUSOPEDgIZkuLXZKM_Sz0'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('dropboxAccessToken', error.response.data);
    throw error;
  }
}

async function scheduleNextRun(cronExpr) {
  const functionName = "PlayHQPuppeteer";
  const ruleName = `ScheduleRule-${Date.now()}`;

  try {
    // 1️⃣ Create EventBridge rule
    await eventbridge.send(new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: cronExpr,
      State: "ENABLED",
    }));

    // 2️⃣ Allow EventBridge to invoke the Lambda function
    await lambda.send(new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: `EventBridgeInvoke-${ruleName}`,
      Action: "lambda:InvokeFunction",
      Principal: "events.amazonaws.com",
      SourceArn: `arn:aws:events:ap-southeast-2:412381761755:rule/${ruleName}`,
    }));

    // 3️⃣ Attach the rule to the Lambda function
    await eventbridge.send(new PutTargetsCommand({
      Rule: ruleName,
      Targets: [{
        Arn: `arn:aws:lambda:ap-southeast-2:412381761755:function:${functionName}`,
        Id: "1",
      }],
    }));
  } catch (error) {
    console.error(`scheduleNextRun`, error);
    throw error;
  }
}

async function getSharePointAccessToken() {
  try {
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`,
      },
    });
    const response = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });
    return response.accessToken;
  } catch (error) {
    console.error('Error acquiring token', error);
    throw error;
  }
}

async function uploadToSharePoint() {
  try {
    const accessToken = await getSharePointAccessToken();
    const filePath = `./result.xlsx`;
    const fileName = '/Current/Sabres/Sabres 14.7 Boys Game Stats (2025).xlsx';

    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fs.statSync(filePath).size;

    const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${process.env.SITE_ID}/drives/${process.env.DRIVE_ID}/root:/${fileName}:/content`;

    return await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': fileSize.toString()
      },
      body: fileBuffer
    });
  } catch (error) {
    console.error('Error Upload to SharePoint', error);
    throw error;
  }
}