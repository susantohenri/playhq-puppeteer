import puppeteer from 'puppeteer';

(async () => {
    // const urls = await getPlayesUrl();
    // const data = await pullData(urls[0]);
    const data = await pullData(`https://www.playhq.com/public/profile/e945b871-e112-4661-910b-bd618626df3e/statistics?tenant=basketball-victoria`);
    console.log({ data });
})();

async function getPlayesUrl() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['stylesheet', 'font', 'image'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
    await page.goto('https://www.playhq.com/basketball-victoria/org/victorian-junior-basketball-league-vjbl/victorian-junior-basketball-league-2025/u14-boys-grading-2-ll-pool-d/game-centre/66171e44', {
        waitUntil: 'networkidle2'
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
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['stylesheet', 'font', 'image'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
    await page.goto(url, {
        waitUntil: 'networkidle2'
    });

    const result = await page.evaluate(() => {
        const data = {};
        [`1 Point`, `2 Points`, `3 Points`, `Total Fouls`].forEach(title => {
            const span = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === title);
            data[title] = span.previousElementSibling.textContent.trim()
        })
        return data;
    });

    await browser.close();

    return result;
}