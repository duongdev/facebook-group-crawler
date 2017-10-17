import * as Firebase from 'firebase';
import fs from 'fs';
import path from 'path';
import moment from 'moment';
import Debug from 'debug';
import config from 'config';

const _d = new Debug('app:firebase');
const firebase = Firebase.initializeApp(config.firebase);
const database = firebase.database();

export const app = async (appName) => {
  const today = moment().format('YYYY-MM-DD');
  const datasetDir = `${path.resolve(__dirname, '../dataset/', appName, today)}`;

  const posts = fs.readdirSync(datasetDir).filter(file => ['post-list.json', 'total-comments.txt'].indexOf(file) === -1);

  posts.forEach(async postFileName => {
    const post = JSON.parse(fs.readFileSync(path.resolve(datasetDir, postFileName)));
    try {
      await database.ref(`${appName}/${post.id}`).set(post);
      _d(`Synced ${post.id}`);
    } catch (error) {
      console.error(error);
    }
  });
};

export const syncOne = async (appName, post) => {
  try {
    await database.ref(`${appName}/${post.id}`).set(post);
    _d(`Synced ${post.id} to Firebase`);
  } catch (error) {
    _d(error);
  }
};
