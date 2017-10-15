import Debug from 'debug';
import fs from 'fs';
import moment from 'moment';
import puppeteer from 'puppeteer';
import * as Group from 'group';

/* Init debug instance */
const _d = new Debug('app:crawler');

const today = moment().format('YYYY-MM-DD');
const datasetDir = `dataset/${today}`;

if (!fs.existsSync(datasetDir)) {
  _d('Create dataset dir %s', datasetDir);
  fs.mkdirSync(datasetDir);
}

const app = (async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
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
    const cookies = JSON.parse(fs.readFileSync('cookies.json2'));
    await cookies.forEach(async cookie => await page.setCookie(cookie));
    await page.waitFor(2000);
  } catch (e) {
    _d('Load cookies fail. Please login...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
    await page.type('#email', process.env.EMAIL);
    await page.type('#pass', process.env.PASS);
    await page.click('#loginbutton');
  }
  return;

  _d('Navigate to VNsbGroup');
  await page.goto('https://www.facebook.com/groups/VNsbGroup', { waitUntil: 'networkidle' });
  _d('VNsbGroup loaded');

  let donePosts;
  try {
    donePosts = fs.readFileSync(`${datasetDir}/post-list.json`).toString().split(',');
  } catch (e) {
    _d('donePosts empty');
    console.log(e);
    donePosts = [];
  }
  donePosts = new Set(donePosts);

  let postPage;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const postURLs = (await Group.getPosts(page))
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
        console.error(err);
      }
    }
  }
});

try {
  app();
} catch (err) {
  console.error(err);
}
