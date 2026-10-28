#!/usr/bin/env python3
"""Compare the user's public reference with a pinned public catalog, without saving source text."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.error

BASE = 'https://ielts.koolearn.com/20140411/'
INDEX = BASE + '785955.html'
CATALOG_SHA256 = 'bf0f6fe5b623a9e5d5a37df16cda1a2a0c1c9ff73b76ed6318d45cc546eb8079'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; IELTS reference audit)'}
HEAD = re.compile(r'^([A-Za-z][A-Za-z.\-\'/]*(?:\s*[,/]\s*[A-Za-z][A-Za-z.\-\'/]*)*)(?=\s+(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|int|art|num|aux|abbr)\.)', re.I)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def normalize(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', value).strip().lower())

def load_catalog(snapshot):
    data = (pathlib.Path(snapshot).resolve(strict=True) / 'assets' / 'essential-vocabulary-data.js').read_bytes()
    if sha(data) != CATALOG_SHA256:
        raise ValueError('unapproved public vocabulary snapshot')
    # Evaluate the bytes just verified, never reopen a possibly changed file.
    program = "const fs=require('node:fs'),vm=require('node:vm');const box={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(0,'utf8'),box,{timeout:10000});process.stdout.write(JSON.stringify(box.module.exports.entries.map(x=>x.word)));"
    result = subprocess.run(['node', '-e', program], input=data, capture_output=True, check=True, timeout=20)
    words = json.loads(result.stdout)
    if len(words) != 8000 or not all(isinstance(word, str) for word in words):
        raise ValueError('unexpected reference catalog')
    catalog = {normalize(word) for word in words}
    if len(catalog) != 8000:
        raise ValueError('duplicate normalized reference headwords')
    return catalog

class RefuseRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise urllib.error.HTTPError(request.full_url, code, 'redirect refused', headers, fp)

def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    if not (parsed.scheme == 'https' and parsed.netloc == 'ielts.koolearn.com' and
            re.fullmatch(r'/20140411/\d+(?:_\d+)?\.html', parsed.path) and not parsed.query and not parsed.fragment):
        raise ValueError('URL is outside the public reference allowlist')
    opener = urllib.request.build_opener(RefuseRedirects())
    with opener.open(urllib.request.Request(url, headers=HEADERS), timeout=18) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != 'https' or final.netloc != parsed.netloc or final.path != parsed.path or final.query:
            raise ValueError('unexpected redirect')
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('page too large')
    time.sleep(.5)
    return url, raw, raw.decode('utf-8', 'replace')

def title_links(markup):
    found = []
    for href, title in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', markup, re.I | re.S):
        plain = re.sub(r'<[^>]+>', '', html.unescape(title)).strip()
        parsed = urllib.parse.urlsplit(html.unescape(href))
        if ('7600' in plain and parsed.hostname == 'ielts.koolearn.com' and
                re.fullmatch(r'/20140411/\d+\.html', parsed.path) and parsed.path not in found):
            found.append(parsed.path)
    if len(found) != 26:
        raise ValueError('expected 26 distinct letter-index links')
    return ['https://ielts.koolearn.com' + p for p in found]

def pages_from_first(url, markup):
    stem = pathlib.PurePosixPath(urllib.parse.urlsplit(url).path).stem
    numbers = {int(n) for n in re.findall(r'(?<!\d)' + re.escape(stem) + r'_(\d+)\.html', markup)}
    if numbers and (max(numbers) > 30 or min(numbers) < 2):
        raise ValueError('unexpected pagination')
    # The first page may hide a middle link while showing the last page.
    return [BASE + stem + '_' + str(n) + '.html' for n in range(2, max(numbers, default=1) + 1)]

def extract(markup):
    start = markup.find('<div class="xqy_core_text">')
    stop = markup.find('<div class="xqy_core_text_btn">', start)
    if start < 0 or stop < 0:
        raise ValueError('article container missing')
    paragraphs = re.findall(r'<p\b[^>]*>(.*?)</p>', markup[start:stop], re.I | re.S)
    found, unparsed = [], 0
    for paragraph in paragraphs:
        plain = normalize(re.sub(r'<[^>]+>', '', html.unescape(paragraph)))
        if not plain:
            continue
        match = HEAD.match(plain)
        if not match:
            unparsed += 1
            continue
        found.extend(normalize(item) for item in re.split(r'\s*[,/]\s*', match.group(1)) if item)
    if not found:
        raise ValueError('article contains no recognizable word rows')
    return found, unparsed, len(paragraphs)

def gather(urls, fetcher):
    results, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(fetcher, url): url for url in urls}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                results.append(future.result())
            except Exception as error:
                failures.append({'url': futures[future], 'type': type(error).__name__})
            if index % 20 == 0:
                print('checked', index, 'of', len(urls), 'public pages', file=sys.stderr, flush=True)
    return results, sorted(failures, key=lambda x: x['url'])

def inspect(catalog, fetcher=fetch):
    _, index_bytes, index_markup = fetcher(INDEX)
    first, failed_first = gather(title_links(index_markup), fetcher)
    further, pagination_errors = [], []
    for url, _raw, markup in first:
        try:
            further.extend(pages_from_first(url, markup))
        except Exception as error:
            pagination_errors.append({'url': url, 'type': type(error).__name__})
    further = sorted(set(further))
    if len(further) > 400:
        raise ValueError('reference pagination exceeds the safety limit')
    rest, failed_rest = gather(further, fetcher)
    matches, unique, rows, unparsed, pages, bad_articles = set(), set(), 0, 0, [], []
    for url, raw, markup in first + rest:
        try:
            words, missing, total = extract(markup)
            rows += total
            unparsed += missing
            unique.update(words)
            matches.update(set(words) & catalog)
            pages.append({'url': url, 'sha256': sha(raw), 'paragraphs': total, 'unparsedParagraphs': missing})
        except Exception as error:
            bad_articles.append({'url': url, 'type': type(error).__name__})
    incomplete = bool(failed_first or failed_rest or pagination_errors or bad_articles)
    return {
        'status': 'incomplete-reference-comparison' if incomplete else 'reference-comparison-only-not-learning-evidence',
        'reference': INDEX, 'indexSha256': sha(index_bytes), 'catalogSha256': CATALOG_SHA256,
        'catalogEntries': len(catalog), 'expectedLetterIndexPages': 26, 'receivedLetterIndexPages': len(first),
        'expectedAdditionalPagesFromVisiblePagination': len(further), 'receivedAdditionalPages': len(rest),
        'articlePagesParsed': len(pages), 'paragraphsSeen': rows, 'unparsedParagraphs': unparsed,
        'uniqueParsedHeadwords': len(unique), 'exactNormalizedHeadwordsInCatalog': len(matches),
        'parsedHeadwordsNotExactlyInCatalog': len(unique - catalog),
        'failedFirstPages': failed_first, 'failedAdditionalPages': failed_rest,
        'paginationErrors': sorted(pagination_errors, key=lambda x: x['url']),
        'unreadableArticleContainers': sorted(bad_articles, key=lambda x: x['url']),
        'pages': sorted(pages, key=lambda x: x['url']),
        'limitations': [
            'This 2014 third-party reference is not an official IELTS 7 vocabulary standard.',
            'The parser excludes ambiguous paragraphs and may miss phrases; page counts are inferred from first-page pagination.',
            'Exact form overlap does not prove sense, appropriate level, pronunciation, teaching, personal mastery or an exam score.',
            'Only aggregate counts and page digests are emitted; source definitions and word lists are not copied.'
        ]
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only public reference comparison; outputs no source definitions or word list.')
    parser.add_argument('--root', required=True, help='path to the pinned public curriculum snapshot')
    parser.add_argument('--full', action='store_true', help='include page URL/hash metadata in stdout')
    args = parser.parse_args(argv)
    result = inspect(load_catalog(args.root))
    if not args.full:
        result.pop('pages')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'reference-comparison-only-not-learning-evidence' else 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('Reference audit failed:', error, file=sys.stderr)
        sys.exit(1)
