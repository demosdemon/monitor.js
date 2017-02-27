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

app.post('/new_url', (req, res, next) => {
    const ctx = req.webtaskContext;
    const config = getConfiguration(ctx);
    const noteText = ctx.body.noteText;

    // parse data.noteText into key and url
    var key, url;

    if (noteText.startsWith('http')) {
        key = url = noteText;
    } else {
        [ key, ...url ] = noteText.split('=');
        url = url.join('=');
    }

    ctx.storage.get((err, data) => {
        if (err) return next(err);

        if (!data) data = { };
        if (!data.urls) data.urls = { };

        data.urls[key] = url;

        ctx.storage.set(data, err => {
            if (err) return next(err);

            res.status(201).send({key:key, url:url});
        });
    });
})

app.get('/', (req, res, next) => {
    const ctx = req.webtaskContext;
    const config = getConfiguration(ctx);

    ctx.storage.get((err, data) => {
        if (err) return next(err);

        const { urls } = data;
        if (!urls)
            res.status(200).send({});

        Promise.all(_.forEach(urls, (url, key) => {
            return new Promise((resolve, reject) => {
                fetchAnalytics(config, key, url, (err, clickCount) => {
                    if (err) return reject(err);

                    const obj = { key: key, url: url, clicks: clickCount };
                    if (clickCount > 0) {
                        iftttNote(config, key, url, clickCount, err => {
                            if (err) reject(err);
                            resolve(obj);
                        });
                    } else resolve();
                });
            });
        })).then(clicks => {
            res.status(200).send(_.reduce(clicks, (acc, item) => {
                if (item)
                    acc[item.key] = item;
            }));
        }).catch(reason => {
            res.status(500).send(reason);
        });
    });
});

function iftttNote(config, shortUrlName, shortUrl, clickCount, cb) {
    const url = config.ifttt_url;
    // {{value1}} ({{value2}}) was clicked {{value3}} times!
    const data = { value1: shortUrlName, value2: shortUrl, value3: clickCount };

    request.post({url: url, json: data}, e => { cb(e); });
}

function fetchAnalytics(config, key, url, cb) {
    const query = {shortUrl: url, projection: 'ANALYTICS_CLICKS'}
    console.log(query)
    config.urlshortener.url.get(query, (err, resp) => {
        if (err) return cb(err);
        console.log(resp);
        cb(null, resp.analytics.twoHours.shortUrlClicks || 0);
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
