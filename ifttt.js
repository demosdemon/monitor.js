'use latest';

// import bodyParser from 'body-parser';
import express from 'express';
import { fromExpress } from 'webtask-tools';
import google from 'googleapis';
import request from 'request';
import _ from 'lodash';
import Boom from 'boom';

const IFTTT_API_BASE = 'https://maker.ifttt.com';
const app = express();

// app.use(bodyParser.json());

function prefetchConfig(cb) {
    return (req, res, next) => {
        const ctx = req.webtaskContext;
        const config = getConfiguration(ctx);

        return cb(ctx, config, req, res, next);
    };
}

app.post('/new_url', prefetchConfig((ctx, config, req, res, next) =>  {
    const noteText = ctx.body.noteText;

    // parse data.noteText into key and url
    var key, url;

    if (noteText.startsWith('http')) {
        key = url = noteText;
    } else {
        [ key, ...url ] = noteText.split('=');
        url = url.join('=');
    }

    getUrlsAsync(ctx)
        .then(urls => {
            urls[key] = url;
            return setUrlsAsync(ctx, urls);
        })
        .then(urls => res.status(201).send({key: key, url: urls[key]}))
        .catch(err => res.status(500).send(err));
}));

app.post('/', prefetchConfig((ctx, config, req, res, next) => {
    getUrlsAsync(ctx)
        .then(urls => Promise.all(_.map(urls, (url, key) => fetchAnalyticsAsync(config, url, key))))
        .then(analytics =>
            Promise.all(
                _.filter(analytics, o => o && o.clicks > 0)
                    .map(o => iftttNoteAsync(config, o.key, o.url, o.clicks))))
        .then(clicks =>
            res.status(200).send(_.reduce(clicks, (acc, value) => {
                if (value)
                    acc[value.key] = value;
                return acc;
            }, {})))
        .catch(err => res.status(500).send(err));
}));

function getUrlsAsync(ctx) {
    return new Promise((resolve, reject) => {
        ctx.storage.get((err, data) => {
            if (err) return reject(err);

            const { urls } = data;
            if (!urls) resolve({});
            else resolve(urls);
        });
    });
}

function setUrlsAsync(ctx, urls) {
    var data = {};
    data.urls = urls;

    return new Promise((resolve, reject) => {
        ctx.storage.set(data, err => {
            if (err) reject(err);
            resolve(data.urls);
        });
    });
}

function iftttNoteAsync(config, shortUrlName, shortUrl, clickCount) {
    const url = config.ifttt_url;
    const data = { value1: shortUrlName, value2: shortUrl, value3: clickCount };
    return new Promise((resolve, reject) => {
        request.post({url: url, json: data}, e => {
            if (e)
                reject(e);
            resolve( {key: shortUrlName, url: shortUrl, clicks: clickCount});
        });
    });
}

function fetchAnalyticsAsync(config, url, key) {
    const query = {shortUrl: url, projection: 'ANALYTICS_CLICKS'};

    return new Promise((resolve, reject) => {
        config.urlshortener.url.get(query, (err, resp) => {
            if (err) return reject(err);
            console.log(resp);
            const obj = {url: url, key: key, clicks: resp.analytics.twoHours.shortUrlClicks || 0}
            console.log(obj);
            resolve(obj);
        });
    });
}

function getConfiguration(context) {
    const keys = [ 'IFTTT_MAKER_KEY', 'IFTTT_MAKER_TRIGGER', 'GOOGLE_API_KEY' ];

    var config = {  };

    _.forEach(keys, key => {
        var value = context.data[key];
        if (!value) throw Boom.preconditionFailed(`Missing config value ${key}`);
        config[key] = value;
    });

    config.ifttt_url = `${IFTTT_API_BASE}/trigger/${config.IFTTT_MAKER_TRIGGER}/with/key/${config.IFTTT_MAKER_KEY}`;
    config.urlshortener = google.urlshortener({ version: 'v1', auth: config.GOOGLE_API_KEY });

    return config;
}

module.exports = fromExpress(app);
