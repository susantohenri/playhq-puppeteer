import path from 'path';
import xlsxPopulate from 'xlsx-populate';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Dropbox } from 'dropbox';
import * as fs from 'fs';

export const handler = async (event) => {
  const { url, nextSchedule } = await getUrlAndNextSchedule()
  const [names, data] = await Promise.all([
    readPlayerNames(),
    pullPlayerData(`https://www.playhq.com${url}`)
  ]);
  let players = names.map(name => {
    return { ...data.find(obj => obj.name === name), name };
  });
  await writeXlsx(players);
  await uploadFile();
  const response = {
    statusCode: 200,
    body: true,
  };
  return response;
};

async function getUrlAndNextSchedule() {
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
  const nextSchedule = await page.evaluate(() => {
    // Select the target element
    const targetElement = document.querySelectorAll(`[name="calendar-empty"]`)[1];
    if (!targetElement) return;

    // Get parent and next sibling
    const sibling = targetElement.parentElement?.nextElementSibling;
    if (!sibling) return;

    // Find the span inside the sibling
    const span = sibling.querySelector("span");
    if (!span) return;

    // Extract text content (e.g., "06:40 PM, Fri, 28 Feb 25")
    const text = span.textContent.trim();
    const match = text.match(/(\d{2}):(\d{2})\s?(AM|PM),\s?(\w{3}),\s?(\d{2})\s?(\w{3})\s?(\d{2})/);
    if (!match) return;

    // Parse extracted values
    let [_, hour, minute, period, dayOfWeek, day, monthStr, year] = match;
    const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const month = monthMap[monthStr];
    year = `20${year}`; // Convert two-digit year to four-digit

    // Convert to 24-hour format
    hour = parseInt(hour, 10);
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    // Create Date object in GMT+11
    const date = new Date(Date.UTC(year, month, day, hour, minute));
    date.setUTCHours(date.getUTCHours() - 11); // Convert to GMT+0

    // Format to "yyyy-mm-dd hh:ii:ss"
    const formattedDate = date.toISOString().replace("T", " ").split(".")[0];

    return formattedDate;
  })

  browser.close()
  return { url, nextSchedule };
}

async function readPlayerNames() {
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
    console.error('Error updating Excel file:', error);
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
    console.error('Error uploading file:', error.message);
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
    console.error('Error refreshing token:', error.response.data);
  }
}