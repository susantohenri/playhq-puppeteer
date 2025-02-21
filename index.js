import puppeteer from 'puppeteer';
import xlsxPopulate from 'xlsx-populate'

(async () => {
    let players = await getPlayesUrl();
    players = [players[10], players[11]]
    players = await Promise.all(players.map(async (player) => {
        const data = await pullData(`https://www.playhq.com${player.url}`);
        return { ...data, ...player }
    }));
    writeXlsx(players);
})();

async function getPlayesUrl() {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            `--disable-gpu`,
            `--disable-dev-shm-usage`,
            `--disable-web-security`,
            `--disable-features=AudioServiceOutOfProcess`,
            `--disable-animations`,
            `--disable-smooth-scrolling`,
            `--disable-background-timer-throttling`,
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

    const hrefs = await page.evaluate(() => {
        const data = [];
        document.querySelectorAll(`tr[data-testid]`).forEach(row => {
            const cells = row.cells
            data.push({
                "#": cells[0].querySelector(`div`).textContent.trim(),
                "name": cells[1].querySelector(`div a span`).textContent.trim(),
                "url": cells[1].querySelector(`div a`).getAttribute(`href`),
            })
        })
        return data;
    });

    await browser.close();

    return hrefs;
}

async function pullData(url) {
    const browser = await puppeteer.launch({
        headless: true,
        devtools: false,
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

    const items = [`1 Point`, `2 Points`, `3 Points`, `Total Fouls`];
    await page.waitForFunction((items) => {
        return [...document.querySelectorAll('span')].some(span =>
            items.some(item => span.textContent.includes(item))
        );
    }, {}, items);

    const result = await page.evaluate((items) => {
        const data = {};
        items.forEach(item => {
            const span = Array.from(document.querySelectorAll(`span`)).find(el => el.textContent.trim() === item);
            data[item] = span.previousElementSibling.textContent.trim()
        })
        return data;
    }, items);

    await browser.close();

    return result;
}

async function writeXlsx(players) {
    try {
        const workbook = await xlsxPopulate.fromFileAsync(`template.xlsx`);
        const sheet = workbook.sheet(`Template`);

        let row = 2;
        players.forEach(player => {
            sheet.cell(`A${row}`).value(player[`#`]);
            sheet.cell(`B${row}`).value(player['name']);
            sheet.cell(`M${row}`).value(player['1 Point']);
            sheet.cell(`N${row}`).value(player['2 Points']);
            sheet.cell(`O${row}`).value(player['3 Points']);
            sheet.cell(`Q${row}`).value(player['Total Fouls']);
            row++;
        })

        await workbook.toFileAsync(`result.xlsx`);
    } catch (error) {
        console.error('Error updating Excel file:', error);
    }
}