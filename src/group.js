import Debug from 'debug';

const _d = new Debug('app:group');

const COMMENT_COUNT_LIMIT = process.env.limit || 500;

export const getPosts = async page => {
  return await page.evaluate(() => {
    const posts = Array.from(document.querySelectorAll('.fbUserStory a ._5ptz'));
    return posts.map(post => post.parentElement.href);
  });
};

export const nextPage = async page => {
  _d('Scroll 1st');
  await page.keyboard.press('End');
  await page.waitFor(3000);

  _d('Scroll 2nd');
  await page.keyboard.press('End');
  await page.waitFor(3000);

  _d('Scroll 3rd');
  await page.keyboard.press('End');
  await page.waitFor(10000);

  return true;
};

export const getPostComments = async (page, postURL) => {
  if (await page.url() !== postURL) {
    _d('Get comments for post %s', postURL);
    // _d('Navigate to %s', postURL);
    await page.goto(postURL, { timeout: 0 });
  }

  const showMoreBtnExists = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a.UFIPagerLink, a.UFICommentLink'))
      .filter(el => el.innerText.indexOf('Hide') === -1);
    return Boolean(els.length);
  });

  const comments = getComments(page);

  if (!showMoreBtnExists || comments.length >= COMMENT_COUNT_LIMIT) {
    _d('Got %s comments for post %s', comments.length, postURL);
    return comments;
  }

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a.UFIPagerLink, a.UFICommentLink'))
      .filter(el => el.innerText.indexOf('Hide') === -1);
    if (els.length) return els[0].click();
  });

  await page.waitFor(1000);
  await page.waitFor(() => !document.querySelector('a.UFIPagerLink > span'), { timeout: 0 });

  return await getPostComments(page, postURL);
};

export const getPostMeta = async (page, postURL) => {
  if (await page.url() !== postURL) {
    _d('Get meta for post %s', postURL);
    await page.goto(postURL, { timeout: 0 });
  }

  const postId = getPostIdFromURL(postURL);
  const caption = await page.evaluate(() => document.querySelector('.userContent').innerText);
  const timestamp = await page.evaluate(() => document.querySelector('._5x46._1yz1 a abbr').dataset.utime);
  const img = await page.evaluate(() => document.querySelector('.mtm img').src);

  const meta = {
    id: postId,
    link: postURL,
    actor: (await page.evaluate(() => {
      const links = document.querySelectorAll('._5x46._1yz1 a');

      return {
        avatar: links[0].querySelector('img').src,
        name: links[0].querySelector('img').attributes['aria-label'].value
      };
    })),
    caption,
    timestamp,
    img
  };

  return meta;
};

export const getPostIdFromURL = URL => URL.match(/permalink\/(.*)/)[1].toString().replace(/\//g, '');

export const getComments = async page => {
  return await page.evaluate(() => {
    const comments = Array.from(document.querySelectorAll('.UFICommentContentBlock'));
    return comments.map(comment => {
      const actor = comment.querySelector('.UFICommentActorName');
      return ({
        actor: {
          name: actor.innerText,
          link: actor.href
        },
        content: comment.querySelector('.UFICommentBody').innerText,
        link: comment.querySelector('.uiLinkSubtle').href,
        timestamp: comment.querySelector('abbr').dataset.utime
      });
    });
  });
};
// const model = {
//   link: '...',
//   username: '',
//   title: '',
//   comments: [
//     {
//       username: '',
//       comment: '',
//       timestamp: ''
//     }
//   ],
//   lastCommentTimestamp: Number,
//   timestamp: Number
// };
