import puppeteer from 'puppeteer';

(async () => {
    const urls = await getPlayesUrl();
    const data = await Promise.all(urls.map(url => pullData(url)));
    console.log({ data });
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

    const selector = `a[href^="/public/profile/"]`
    await page.waitForSelector(selector, { timeout: 10000 });
    const hrefs = await page.evaluate(selector => {
        return [...document.querySelectorAll(selector)].map(player => `https://www.playhq.com` + player.getAttribute(`href`));
    }, selector);

    await browser.close();

    return hrefs;
}

async function pullData(url) {
    const browser = await puppeteer.launch({
        headless: true,
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
        const targets = [`1 Point`, `2 Points`, `3 Points`, `Total Fouls`];
        return [...document.querySelectorAll('span')].some(span =>
            targets.some(target => span.textContent.includes(target))
        );
    });
    const result = await page.evaluate(() => {
        const data = {
            name: document.querySelector(`h1`).textContent.trim(),
        };
        [`1 Point`, `2 Points`, `3 Points`, `Total Fouls`].forEach(title => {
            const span = Array.from(document.querySelectorAll(`span`)).find(el => el.textContent.trim() === title);
            data[title] = span.previousElementSibling.textContent.trim()
        })
        return data;
    });

    await browser.close();

    return result;
}