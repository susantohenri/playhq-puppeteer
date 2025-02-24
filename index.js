import puppeteer from 'puppeteer';
import xlsxPopulate from 'xlsx-populate'
import { Dropbox } from 'dropbox';
import * as fs from 'fs';

(async () => {
    const [names, data] = await Promise.all([
        readPlayerNames(),
        getPlayesUrl()
    ]);
    let players = names.map(name => {
        return { ...data.find(obj => obj.name === name), name };
    });

    players = await Promise.all(players.map(async (player) => {
        if (!player.url) return { ...player };
        const data = await pullData(`https://www.playhq.com${player.url}`);
        return { ...data, ...player }
    }));
    await writeXlsx(players);
    await uploadFile();
})();

async function readPlayerNames() {
    const workbook = await xlsxPopulate.fromFileAsync(`./template.xlsx`);
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
            '--no-sandbox',
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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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

async function uploadFile() {
    try {
        const contents = fs.readFileSync(`result.xlsx`);

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