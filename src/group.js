import Debug from 'debug';

const _d = new Debug('app:group');

// The maximum of the number of comments crawl per post
// It may depend on your computer processor
const COMMENT_COUNT_LIMIT = process.env.limit || 500;

// Get all posts loaded on group view
export const getPosts = async page => {
  return await page.evaluate(() => {
    const posts = Array.from(document.querySelectorAll('.fbUserStory a ._5ptz'));
    return posts.map(post => post.parentElement.href);
  });
};

// Send "End" button to scroll to the bottom to let facebook loads more posts
export const nextPage = async page => {
  _d('Scroll down');
  await page.keyboard.press('End');
  return await page.waitFor(3e3);
};

// Expand all hidden comments (until reach COMMENT_COUNT_LIMIT)
// return an array of comments
export const getPostComments = async (page, postURL) => {
  // Navigate to post if browser currently in another address
  if (await page.url() !== postURL) {
    _d('Get comments for post %s', postURL);
    await page.goto(postURL, { timeout: 0 });
  }

  // Find "Load more comments/replies" buttons
  const showMoreBtnExists = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a.UFIPagerLink, a.UFICommentLink'))
      .filter(el => el.innerText.indexOf('Hide') === -1);
    return Boolean(els.length);
  });

  const comments = await getComments(page);

  _d('%d comments loaded', comments.length);

  // Check if we should get more comments or return current comment list
  if (!showMoreBtnExists || comments.length >= COMMENT_COUNT_LIMIT) {
    _d('Got %s comments for post %s', comments.length, postURL);
    return comments;
  }

  // Get more comments
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a.UFIPagerLink, a.UFICommentLink'))
      .filter(el => el.innerText.indexOf('Hide') === -1);
    if (els.length) return els[0].click();
  });

  await page.waitFor(1e3);
  await page.waitFor(() => !document.querySelector('a.UFIPagerLink > span'), { timeout: 0 });

  return await getPostComments(page, postURL);
};

// Get post meta (poster, caption, image, posted time)
export const getPostMeta = async (page, postURL) => {
  if (await page.url() !== postURL) {
    _d('Get meta for post %s', postURL);
    await page.goto(postURL, { timeout: 0 });
  }

  const postId = getPostIdFromURL(postURL);
  const caption = await page.evaluate(() => document.querySelector('.userContent').innerText);
  const timestamp = await page.evaluate(() => document.querySelector('._5x46._1yz1 a abbr').dataset.utime);
  const imageURL = await page.evaluate(() =>
    document.querySelector('.mtm a').dataset.ploi ||
    document.querySelector('.mtm img').src);
  const reactions = await page.evaluate(() => document.querySelector('.tooltipText').innerText.match(/and\s(.*?)\s/)[1]);

  const meta = {
    id: postId,
    link: postURL,
    actor: (await page.evaluate(() => {
      const links = document.querySelectorAll('._5x46._1yz1 a');

      return {
        avatar: links[0].querySelector('img').src,
        name: links[0].querySelector('img').attributes['aria-label'].value,
        link: links[0].href
      };
    })),
    caption,
    timestamp,
    imageURL,
    reactions
  };

  return meta;
};

export const getPostIdFromURL = URL => URL.match(/permalink\/(.*)/)[1].toString().replace(/\//g, '').replace(/\n/g, '');

// Get comments loaded in current browser window
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
