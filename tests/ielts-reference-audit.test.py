import importlib.util
import contextlib
import io
import json
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('audit_ielts_reference', ROOT / 'tools' / 'audit-ielts-reference.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)

class ReferenceAuditTests(unittest.TestCase):
    def test_pinned_catalog_can_be_read_without_a_user_profile(self):
        self.assertEqual(len(AUDIT.load_catalog(ROOT)), 8000)

    def test_unapproved_catalog_is_rejected_before_javascript_execution(self):
        with mock.patch.object(pathlib.Path, 'read_bytes', return_value=b'unapproved'), \
             mock.patch.object(AUDIT.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'unapproved'):
                AUDIT.load_catalog(ROOT)
            run.assert_not_called()

    def test_word_extraction_counts_ambiguity_and_does_not_guess(self):
        markup = ('<div class="xqy_core_text"><p>river n. synthetic</p>'
                  '<p>path, paths n. synthetic</p><p>unknown unusual format</p><p>&nbsp;</p></div>'
                  '<div class="xqy_core_text_btn">')
        words, unparsed, paragraphs = AUDIT.extract(markup)
        self.assertEqual(words, ['river', 'path', 'paths'])
        self.assertEqual((unparsed, paragraphs), (1, 4))
        with self.assertRaisesRegex(ValueError, 'no recognizable'):
            AUDIT.extract('<div class="xqy_core_text"><p>unusable row</p></div><div class="xqy_core_text_btn">')

    def test_pagination_fills_hidden_middle_without_following_other_paths(self):
        url = AUDIT.BASE + '123456.html'
        page = '123456_2.html 123456_3.html 123456_10.html 123456_12.html'
        pages = AUDIT.pages_from_first(url, page)
        self.assertEqual(len(pages), 11)
        self.assertIn(AUDIT.BASE + '123456_11.html', pages)
        with self.assertRaisesRegex(ValueError, 'unexpected pagination'):
            AUDIT.pages_from_first(url, '123456_31.html')

    def test_aggregate_emits_no_copied_words_or_definitions(self):
        urls = [AUDIT.BASE + f'{200000 + n}.html' for n in range(26)]
        index = ''.join(f'<a href="{url}">reference 7600</a>' for url in urls)
        article = '<div class="xqy_core_text"><p>river n. invented definition</p><p>path n. invented</p></div><div class="xqy_core_text_btn">'
        def fetcher(url):
            text = index if url == AUDIT.INDEX else article
            return url, text.encode('utf-8'), text
        result = AUDIT.inspect({'river'}, fetcher)
        self.assertEqual(result['status'], 'reference-comparison-only-not-learning-evidence')
        self.assertEqual((result['articlePagesParsed'], result['uniqueParsedHeadwords']), (26, 2))
        self.assertEqual((result['exactNormalizedHeadwordsInCatalog'], result['parsedHeadwordsNotExactlyInCatalog']), (1, 1))
        output = json.dumps(result)
        self.assertNotIn('river', output)
        self.assertNotIn('invented definition', output)

    def test_missing_page_is_reported_as_incomplete(self):
        urls = [AUDIT.BASE + f'{300000 + n}.html' for n in range(26)]
        index = ''.join(f'<a href="{url}">reference 7600</a>' for url in urls)
        article = '<div class="xqy_core_text"><p>river n. invented</p></div><div class="xqy_core_text_btn">'
        def fetcher(url):
            if url == urls[0]:
                raise OSError('synthetic failure')
            text = index if url == AUDIT.INDEX else article
            return url, text.encode('utf-8'), text
        result = AUDIT.inspect({'river'}, fetcher)
        self.assertEqual(result['status'], 'incomplete-reference-comparison')
        self.assertEqual(len(result['failedFirstPages']), 1)
        self.assertEqual(result['receivedLetterIndexPages'], 25)

    def test_fetch_rejects_other_hosts_and_query_strings_before_network(self):
        for url in ['https://example.org/20140411/123456.html', AUDIT.INDEX + '?x=1',
                    'http://ielts.koolearn.com/20140411/123456.html']:
            with self.assertRaisesRegex(ValueError, 'allowlist'):
                AUDIT.fetch(url)

    def test_redirects_and_output_path_arguments_are_not_accepted(self):
        handler = AUDIT.RefuseRedirects()
        request = AUDIT.urllib.request.Request(AUDIT.INDEX)
        with self.assertRaises(AUDIT.urllib.error.HTTPError):
            handler.redirect_request(request, None, 302, '', {}, 'https://example.org/')
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                AUDIT.main(['--root', str(ROOT), '--output', 'unexpected.json'])

if __name__ == '__main__':
    unittest.main()
