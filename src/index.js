import Debug from 'debug';
import fs from 'fs';
import moment from 'moment';
import puppeteer from 'puppeteer';
import * as Group from 'group';
import auth from 'auth';

/* Init debug instance */
const _d = new Debug('app:crawler');

const today = moment().format('YYYY-MM-DD');
const datasetDir = `dataset/${today}`;

if (!fs.existsSync('dataset')) {
  _d('Create dataset dir %s', 'dataset');
  fs.mkdirSync('dataset');
}

if (!fs.existsSync(datasetDir)) {
  _d('Create dataset dir %s', datasetDir);
  fs.mkdirSync(datasetDir);
}

const app = (async () => {
  const browser = await puppeteer.launch({
    headless: false,
    // executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    devtools: false,
    timeout: 0
  });
  const page = await browser.newPage();
  await page.setViewport({
    isLandscape: true,
    width: 1200,
    height: 800
  });

  _d('Loading cookies...');
  try {
    const cookies = JSON.parse(fs.readFileSync('cookies.json'));
    await cookies.forEach(async cookie => await page.setCookie(cookie));
    await page.waitFor(2000);
  } catch (e) {
    _d('Load cookies fail. Please login...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
    await page.type('#email', auth.email);
    await page.type('#pass', auth.pass);
    await page.click('#loginbutton');
    await page.waitFor('#userNav', { timeout: 60e3 });
    fs.writeFileSync('cookies.json', JSON.stringify(await page.cookies()));
    _d('Login successfully. Cookie saved to cookies.json');
  }

  _d('Navigate to VNsbGroup');
  await page.goto('https://www.facebook.com/groups/VNsbGroup', { waitUntil: 'networkidle' });
  _d('VNsbGroup loaded');

  let donePosts;
  try {
    donePosts = fs.readFileSync(`${datasetDir}/post-list.json`).toString().split(',');
  } catch (e) {
    _d('donePosts empty');
    donePosts = [];
  }
  donePosts = new Set(donePosts);

  let postPage;

  // eslint-disable-next-line no-constant-condition
  while ((await Group.getPosts(page)).length <= 100) {
    let postURLs = await Group.getPosts(page);
    // Reload if the page is too long
    if (postURLs.length > 100) {
      _d('Page is too long with %d posts. Reloading...', postURLs.length);
      await page.reload({
        waitUntil: 'networkidle'
      });
      postURLs = await Group.getPosts(page);
      _d('Page reloaded');
    }

    postURLs = (await Group.getPosts(page))
      .filter((p, idx) => idx !== 0)
      .filter(p => !donePosts.has(Group.getPostIdFromURL(p)));

    if (!postURLs.length) {
      Group.nextPage(page);
    }

    for (let i in postURLs) {
      try {
        await postPage.close();
      } catch (err) {/* Ignore */}
      try {
        postPage = await browser.newPage();
        await postPage.setViewport({
          isLandscape: true,
          width: 1200,
          height: 800
        });

        const postURL = postURLs[i];
        const postId = Group.getPostIdFromURL(postURL);
        const meta = await Group.getPostMeta(postPage, postURL);
        const comments = await Group.getPostComments(postPage, postURL);
        fs.writeFileSync(`${datasetDir}/${postId}.json`, JSON.stringify({
          ...meta,
          comments
        }));
        donePosts.add(postId);
        fs.writeFileSync(`${datasetDir}/post-list.json`, Array.from(donePosts).join(','));
      } catch (err) {
        console.error(err.toString());
      }
    }
  }
});

try {
  app();
} catch (err) {
  console.error(err);
}
