#!/usr/bin/env python

from os.path import dirname, basename, join, abspath, splitext
from collections import Mapping
import requests
from six.moves.urllib_parse import urlparse

try:
    import ConfigParser as configparser

    def __get_section(self, section):
        if not self.has_section(section):
            raise KeyError(section)
        return {key: self.get(section, key) for key in self.options(section)}

    configparser.ConfigParser.__getitem__ = __get_section
except ImportError:
    import configparser

try:
    import simplejson as json
except ImportError:
    import json

BASE_DIR = dirname(__file__)

REQUIRED = object()
DEFAULTS = dict(
    wt_url='https://webtask.it.auth0.com',
    wt_token=REQUIRED,
    wt_container=REQUIRED,
    ifttt_maker_key=REQUIRED,
    ifttt_maker_trigger='link_clicked',
    google_api_key=REQUIRED,
)


def create_token(settings, file, name=None, **kwargs):
    file_parsed = urlparse(file)

    params = dict(
        ten=settings['wt_container'],
        # token reissuence depth
        dd=0,
        # encrypted secrets
        ectx=dict(
            IFTTT_MAKER_KEY=settings['ifttt_maker_key'],
            GOOGLE_API_KEY=settings['google_api_key'],
        ),
        # unecrypted parameters
        pctx=dict(
            IFTTT_MAKER_TRIGGER=settings['ifttt_maker_trigger']
        ),
        # parse body
        pb=1,
        # merge body
        mb=1,
    )

    if name:
        params['jtn'] = name

    tok = object()
    for key in ['ten', 'jtn', 'jtnm', 'nbf', 'exp', 'host', 'meta', 'pb', 'mb',
                'dd', 'dr', 'pctx', 'ectx', 'url', 'code', 'ls', 'lm', 'lh',
                'ld', 'lw', 'lo', 'lts', 'ltm', 'ltd', 'ltw', 'lto']:
        default, value = params.get(key), kwargs.get(key, tok)
        if value is not tok:
            if isinstance(default, Mapping) and isinstance(value, Mapping):
                value = merge_defaults(default, value)
            params[key] = value

    if file_parsed.scheme:
        params['url'] = file
    else:
        with open(file, 'rb') as fp:
            params['code'] = fp.read()

    response = requests.post(
        '{base_url}/api/tokens/issue'.format(base_url=settings['wt_url']),
        json=params,
        headers=dict(
            authorization='Bearer {token}'.format(token=settings['wt_token'])
        ),
        allow_redirects=False
    )

    response.raise_for_status()

    return dict(token=response.text, url=response.headers.get('location'))


def schedule_cronjob(settings, name, token, schedule):
    url = '{base}/api/cron/{ten}/{name}'.format(
        base=settings['wt_url'], ten=settings['wt_container'], name=name)
    body = dict(token=token, schedule=schedule)

    response = requests.put(url, json=body, headers=dict(
        authorization='Bearer {token}'.format(token=settings['wt_token'])
    ))

    return response.text


def merge_defaults(defaults, config):
    return {
        key: config[key] if key in config else defaults[key]
        for key in (frozenset(defaults.keys()) | frozenset(config.keys()))
    }


def main():
    config = configparser.ConfigParser()
    config.read('secrets')

    settings = merge_defaults(DEFAULTS, config['secrets'])
    for key in DEFAULTS.keys():
        if settings[key] is REQUIRED:
            raise ValueError('{key} is required but not provided in secrets file!'.format(key=key))

    with open(join(BASE_DIR, 'manifest.json')) as fp:
        manifest = json.load(fp)

    for file in manifest:
        filename = file.get('filename')
        if filename:
            filename = abspath(join(BASE_DIR, filename))
            file.setdefault('name', splitext(basename(filename))[0])

        results = create_token(
            settings,
            file.get('filename') or file.get('url'),
            file.get('name'),
            **file.get('token_extras', {}))

        print('{name} token issued {url} {token}'.format(
            name=file.get('name'), url=results['url'], token=results['token']))

        if file.get('schedule'):
            s = schedule_cronjob(settings, file.get('name'), results['token'], file['schedule'])
            print('Scheduled Job {name} {res}'.format(name=file.get('name'), res=s))


if __name__ == '__main__':
    main()
