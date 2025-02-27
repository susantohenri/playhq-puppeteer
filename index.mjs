import path from 'path';
import xlsxPopulate from 'xlsx-populate';
import puppeteer from 'puppeteer-core';
import chromium from'@sparticuz/chromium';

export const handler = async (event) => {
  const [names, data] = await Promise.all([
    readPlayerNames(),
    pullPlayerData()
  ]);
  const response = {
    statusCode: 200,
    body: JSON.stringify({names, data}),
  };
  return response;
};

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

async function pullPlayerData() {
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
  await page.goto(`https://www.playhq.com/basketball-victoria/org/victorian-junior-basketball-league-vjbl/victorian-junior-basketball-league-2025/u14-boys-grading-2-ll-pool-d/game-centre/66171e44`, {
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