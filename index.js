import puppeteer from 'puppeteer';
import xlsxPopulate from 'xlsx-populate'
import { Dropbox } from 'dropbox';
import * as fs from 'fs';

(async () => {
    let players = await getPlayesUrl();
    players = await Promise.all(players.map(async (player) => {
        const data = await pullData(`https://www.playhq.com${player.url}`);
        return { ...data, ...player }
    }));
    await writeXlsx(players);
    await uploadFile();
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
        headless: false,
        devtools: true,
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

        const dbx = new Dropbox({ accessToken: `sl.u.AFhVsfx5KoGqCV1KN4suuJ-o-_d6SHmEDpH0uoQ1UeMLx0YEay3TrgWWebGPuyfF7JEYyh5GoQ1Xaqu5-nWxpOsORB91bzyvhAY0_Hu1Wn2KltAEYWsPsv3tWNUy-cqrmiFDDLFmuE5UMWrxDD6IFmsRCOm0K7Do1cMyGaTtRKhZsvjrgm5s_Mtu9zLxG8-BcVTEbjBQQY1ztkaJNZEnLKOJH2WSvV0oQXga564JhuSK_vF4RfGr4v5fdaFSKn8Ml2UFTbH8CfSFZ3GW0y6GS1MzsbPf6BtLbMYBGvDdunrHpvUQCYUrtDl3tUz5eizdzjTMMGfdNcvs3PYO6kcm-9JIBghXWabllp-ejQWppmFBon1Aen3AsKg8BsUSnf2iOc2Vz0LY88rHc__HkCm0JytB2E8Ej3EZVu08OEM5MNgS_b_MkltQalo31-v6mlmb396qD3MIh3bwBQUhDyhooBbEfjY5AiaVOpteQWlQIp_UZdG20FcEvEpH50QVltCyjBzvSyG12pkwuA1Z8rvgqfVkLPXswc6iOu5fFDjzQTWgaz23ed_YNcelS9bfVu576_P_rZsQAvwnpEcXb1xXcTg1BX2DVnW2waOyBGSfKMXP6C9q6mkH5wTUBNsop4Igu0dV0nUEfpZDsQmH7CRkZ33WMwT7NMTVhSCoGHNRotXIaSEivc8GV93OMNw5qhO7SerMEDo0SpugxrvJ3v4q3tywN_RiVgeelndsfAyBNMGSYQgmbutvOsd9jqGzMd-p3wkyWrHTePvmkCXxuIrXMaVSWfUsLrPgdrjLs8ZTIljPc0Tr-92-s6k49BtC-sxpCIkE3LsIbbhccreNVNqTfoG2COu9UEJdENElS62VicHxDzdO8VrHRWMVbL-JN1ReDHLfJwrga4-d4h8G2uSMzkxbbgVih0_bci4j5OI96sExDKDsVLz_w9tq3SEY4YrduKgJfoCBJHiyLJAe2Zx62BkNLrkLssmQEvYyA3t9rR9dkB3X2tyGz9Xuyt0mV0WIW_yrJXPCGIqLnexADW7FwK_EOk_RW_wV8-mikiVym85EJFquGteZiWQ3j--U_7hcCYaHBKDxpOu7LYzy1yLXYEJkkd6No3gwCnMzQEw8rIxR5j3yBoLORS-OY1uBUZD9UGjF3b62K8EeZQcHIyPswVuXGOYVzB3x2TQgsAeI0keMH2xbcFtwngEYXXoO6gWqZ3gRL7BpLRjm573RQ_kG-CGsqyEYrb1wr7CLVnX36eFXOGwWVC4qktaXoP6NcG13f9dRv-tal9MeE482pe4wHM4W` });
        return await dbx.filesUpload(uploadParams);
    } catch (error) {
        console.error('Error uploading file:', error.message);
        throw error;
    }
}