import Debug from 'debug';
import fs from 'fs';
import path from 'path';
import moment from 'moment';
import puppeteer from 'puppeteer';
import * as Group from 'group';
import * as Firebase from 'firebase';
import auth from 'auth';

/* Init debug instance */
const _d = new Debug('app:crawler');

/* Config dataset directories */
const DATA_PATH = path.resolve(__dirname, '../dataset');
const today = moment().format('YYYY-MM-DD');
const datasetDir = (app) => `${DATA_PATH}/${app}/${today}`;

/* Ensure dataset exists. If not, create it */
if (!fs.existsSync('dataset')) {
  _d('Create dataset dir %s', 'dataset');
  fs.mkdirSync('dataset');
}

const app = (async (appName, groupURL) => {
  /* Ensure dataset exists for app */
  if (!fs.existsSync(`${DATA_PATH}/${appName}`)) {
    _d('Create dataset dir %s', `${DATA_PATH}/${appName}`);
    fs.mkdirSync(`${DATA_PATH}/${appName}`);
  }

  /* Init puppeteer browser and page */
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS || false,
    devtools: false,
    timeout: 0
  });

  const page = await browser.newPage();
  await page.setViewport({
    isLandscape: true,
    /* Just set this page size based on my best experience :) */
    width: 1200,
    height: 800
  });

  _d('Loading cookies from cookies.json');
  try {
    const cookies = JSON.parse(fs.readFileSync('cookies.json'));
    await cookies.forEach(async cookie => await page.setCookie(cookie));

    /* If we dont wait, the browser can't apply the cookies (?).
      Is my setCookie wrong? (async await??) */
    await page.waitFor(2000);
  } catch (e) {
    /* Try to login if cookies parse failed or no cookies saved before.
      In this case, I havent check for token expire situation. PR welcome! */
    _d('Load cookies fail. Please login...');
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
    await page.type('#email', auth.email);
    await page.type('#pass', auth.pass);
    await page.click('#loginbutton');
    await page.waitFor('#userNav', { timeout: 60e3 });
    fs.writeFileSync('cookies.json', JSON.stringify(await page.cookies()));
    _d('Login successfully. Cookie saved to cookies.json');
  }

  _d('Navigate to %s', appName);
  await page.goto(groupURL, { waitUntil: 'networkidle' });

  /* Just get Group's name */
  _d('Group loaded %s', await page.evaluate(() => document.querySelector('#seo_h1_tag').innerText));

  /* donePosts is the list of crawled post (by day). In each run, we wont re-crawl posts.
    totalComments is the total number of comment (by day) */
  let donePosts;
  let totalComments;
  try {
    donePosts = fs.readFileSync(`${datasetDir(appName)}/post-list.json`).toString().split(',');
  } catch (e) {
    _d('donePosts empty');
    donePosts = [];
  }
  try {
    totalComments = fs.readFileSync(`${datasetDir(appName)}/total-comments.txt`).toString() * 1;
  } catch (e) {
    totalComments = 0;
  }

  donePosts = new Set(donePosts);

  let postPage;

  // eslint-disable-next-line no-constant-condition
  while (1) {
    let postURLs = await Group.getPosts(page);
    // Reload if the page is too long to prevent facebook memory leak
    if (postURLs.length > 1000) {
      _d('Page is too long with %d posts. Reloading...', postURLs.length);
      await page.reload({
        waitUntil: 'networkidle'
      });
      postURLs = await Group.getPosts(page);
      _d('Page reloaded');
    }

    postURLs = (await Group.getPosts(page))
      .filter((p, idx) => idx !== 0)
      .filter(p => p.indexOf('permalink') !== -1)
      .filter(p => !donePosts.has(Group.getPostIdFromURL(p)));

    if (!postURLs.length) {
      await Group.nextPage(page);
    }

    for (let i in postURLs) {
      try {
        await postPage.close();
      } catch (err) {/* Ignore */}

      if (!fs.existsSync(datasetDir(appName))) {
        _d('Create dataset dir %s', datasetDir(appName));
        fs.mkdirSync(datasetDir(appName));
      }

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
        const post = {
          ...meta,
          comments,
          commentCount: comments.length
        }
        ;
        fs.writeFileSync(`${datasetDir(appName)}/${postId}.json`, JSON.stringify(post));

        Firebase.syncOne(appName, post);

        donePosts.add(postId);
        fs.writeFileSync(`${datasetDir(appName)}/post-list.json`, Array.from(donePosts).join(','));
        totalComments += comments.length;
        fs.writeFileSync(`${datasetDir(appName)}/total-comments.txt`, totalComments);
      } catch (err) {
        console.error(err.toString());
      }
      await postPage.close();
    }
  }
});

try {
  app('VNsbGroup', 'https://www.facebook.com/groups/VNsbGroup');
} catch (err) {
  console.error(err);
}
