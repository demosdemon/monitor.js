# monitor.js

This is a webtask.io script that periodically checks the analytics for a series of goo.gl urls and sends an IFTTT notification when there have been clicks in the last two hours.

## secrets

An INI file called `secrets` must be defined side-by-side the `deploy.py` script

```ini
[secrets]
WT_TOKEN=
WT_CONTAINER=
IFTTT_MAKER_KEY=
GOOGLE_API_KEY=
```

## deploy

The deploy file expects a `manifest.json` which defines the tokens to publish to webtask.io

```javascript
[
    {
        "filename": "ifttt.js", // filename or url property is required
        "name": "monitor", // optional name, taken from filename or url otherwise
        "schedule": "30 * * * *", // optional schedule property for cron jobs
        "token_extras": { // optional overriding extra token parameters see: https://webtask.io/docs/api_issue
            "pctx": { // dictionaries will be merged
                "TEST_KEY": "TEST_VALUE"
            }
        }
    }
]
```
