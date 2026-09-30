import copy
import unittest
from urllib.parse import quote

from article_payload import original_image_url
from scraper import parse_article, supported_article_url

DWELL_URL = 'https://www.dwell.com/home/sample-house-abcd'
ORIGINAL = 'https://images2.dwell.com/photos/100/200/original.jpg'
SECOND = 'https://images2.dwell.com/photos/100/201/original.jpg'


def text_field(value, source='state.collection.description', format='text'):
    return {'status': 'present' if value else 'empty', 'value': value, 'format': format, 'source': source}


def snapshot():
    return {
        'schema_version': 1, 'source': 'dwell', 'url': DWELL_URL,
        'title': 'Sample House', 'building': 'Sample House', 'studio': 'Example Studio',
        'body': text_field('A house by the sea.'),
        'sections': [
            {'title': 'Project information', 'rows': [
                {'label': 'Location', 'value': 'Québec | Canada'},
                {'label': 'Year', 'value': '2019'},
                {'label': 'Style', 'value': 'Scandinavian'},
                {'label': 'Structure', 'value': 'House'},
            ]},
            {'title': 'Credits', 'rows': [{'label': 'Architect', 'value': 'Example Studio'}]},
            {'title': 'Details', 'rows': [{'label': 'Area', 'value': '100 m²'}]},
            {'title': 'Tags', 'rows': [{'label': 'Tags', 'value': 'Wood; Coastal'}]},
        ],
        'expected_photo_count': 2,
        'photos': [
            {'id': '200', 'url': ORIGINAL + '?w=160&q=35&auto=format', 'caption': text_field('Ocean <em>view</em>.', 'dom.figcaption', 'html')},
            {'id': '201', 'url': SECOND, 'caption': text_field('', 'state.photo.description')},
        ],
        'warnings': [],
    }


class ArticleParsingTests(unittest.TestCase):
    def test_dwell_originals_captions_and_tables(self):
        article = parse_article(DWELL_URL, article_data=snapshot())
        self.assertEqual(article.title, 'Sample House')
        self.assertEqual(article.studio, 'Example Studio')
        self.assertEqual([image.url for image in article.images], [ORIGINAL, SECOND])
        self.assertEqual([image.local_filename for image in article.images], ['01.jpg', '02.jpg'])
        self.assertIn('![](images/01.jpg)\n\nOcean *view*.', article.content_md)
        self.assertIsNone(article.images[1].caption)
        self.assertTrue(article.content_md.endswith('![](images/02.jpg)\n'))
        self.assertIn('| Location | Québec \\| Canada |', article.content_md)
        for section in ['Description', 'Project information', 'Credits', 'Details', 'Tags', 'Photos']:
            self.assertIn('## ' + section, article.content_md)

    def test_explicit_empty_body_and_caption(self):
        data = snapshot()
        data['body'] = text_field('')
        article = parse_article(DWELL_URL, article_data=data)
        self.assertNotIn('## Description', article.content_md)
        self.assertEqual(len(article.images), 2)

    def test_missing_body_or_caption_is_not_accepted_as_empty(self):
        for field in ['body', 'caption']:
            data = snapshot()
            target = data['body'] if field == 'body' else data['photos'][1]['caption']
            target.update(status='missing', value='')
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'unconfirmed'):
                parse_article(DWELL_URL, article_data=data)

    def test_incomplete_gallery_rejected(self):
        data = snapshot()
        data['expected_photo_count'] = 20
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            parse_article(DWELL_URL, article_data=data)

    def test_duplicate_photos_rejected(self):
        data = snapshot()
        data['photos'][1] = copy.deepcopy(data['photos'][0])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_article(DWELL_URL, article_data=data)

    def test_id_url_mismatch_rejected(self):
        data = snapshot()
        data['photos'][1]['id'] = '999'
        with self.assertRaisesRegex(ValueError, 'Photo ID'):
            parse_article(DWELL_URL, article_data=data)

    def test_schema_and_project_identity_validation(self):
        for field, value in [('schema_version', 2), ('schema_version', True), ('source', 'unknown'), ('url', DWELL_URL + '-other'), ('photos', {}), ('expected_photo_count', True), ('expected_photo_count', 1001), ('sections', 'bad'), ('title', ''), ('warnings', 'bad')]:
            data = snapshot()
            data[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                parse_article(DWELL_URL, article_data=data)
        data = snapshot()
        data['auth'] = {'token': 'do not accept'}
        with self.assertRaises(ValueError):
            parse_article(DWELL_URL, article_data=data)

    def test_malformed_text_states_are_rejected(self):
        for update in [{'status': []}, {'status': 'empty', 'value': 'not empty'}, {'format': 'unsupported'}, {'source': ''}, {'value': None}]:
            data = snapshot()
            data['body'].update(update)
            with self.subTest(update=update), self.assertRaises(ValueError):
                parse_article(DWELL_URL, article_data=data)

    def test_old_dwell_html_requires_userscript_update(self):
        with self.assertRaisesRegex(ValueError, 'update the userscript'):
            parse_article(DWELL_URL, '<h1>Old snapshot</h1>')

    def test_plain_text_does_not_turn_into_html_or_markdown_images(self):
        data = snapshot()
        data['body'] = text_field('<script>alert(1)</script> ![bad](https://evil.test/image)')
        article = parse_article(DWELL_URL, article_data=data)
        self.assertNotIn('<script>', article.content_md)
        self.assertNotIn('![bad]', article.content_md)

    def test_dom_html_sanitization_preserves_text_and_formatting(self):
        data = snapshot()
        data['body'] = text_field('<p>Safe <strong>text</strong></p><script>secret()</script><a href="javascript:evil()">Link</a><img src="https://evil.test/image">', 'dom.description', 'html')
        article = parse_article(DWELL_URL, article_data=data)
        self.assertIn('Safe **text**', article.content_md)
        self.assertNotIn('secret()', article.content_md)
        self.assertNotIn('javascript:', article.content_md)
        self.assertNotIn('evil.test', article.content_md)

    def test_skimlinks_unwrap_and_tracking_removal(self):
        self.assertEqual(original_image_url('https://go.skimresources.com/?url=' + quote(ORIGINAL + '?_gl=tracking', safe='')), ORIGINAL)
        for url in ['https://evil.test/original.jpg', 'https://images2.dwell.com.evil.test/photos/100/200/original.jpg', 'https://images2.dwell.com/photos/100/200/small.jpg', 'http://images2.dwell.com/photos/100/200/original.jpg']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                original_image_url(url)

    def test_site_dispatch_validation(self):
        for url in [DWELL_URL, DWELL_URL + '/', 'https://www.dwell.com/article/test', 'https://www.dezeen.com/2026/09/10/test/', 'https://dezeen.com/test']:
            self.assertTrue(supported_article_url(url))
        for url in [DWELL_URL + '/123', 'https://www.dwell.com/article/test/123', 'https://www.dwell.com/article/', 'https://www.dwell.com/home/', 'https://www.dezeen.com.evil.test/test', 'https://user@www.dezeen.com/test', 'http://www.dwell.com/home/test', 'https://www.dezeen.com/']:
            self.assertFalse(supported_article_url(url))

    def test_dezeen_regression(self):
        html = '''<article><h1>Sample House by Example Studio</h1>
        <header><figure><img src="https://static.dezeen.com/house-800x600.jpg"/><figcaption>Outside</figcaption></figure></header>
        <div class="main-article-body"><p>A house.</p><figure><img src="https://static.dezeen.com/inside-800x600.jpg"/><figcaption>Inside</figcaption></figure></div></article>'''
        article = parse_article('https://www.dezeen.com/2026/09/10/sample/', html)
        self.assertEqual(article.building, 'Sample House')
        self.assertEqual(article.studio, 'Example Studio')
        self.assertEqual(len(article.images), 2)
        self.assertEqual(article.images[0].url, 'https://static.dezeen.com/house.jpg')
        self.assertIn('A house.', article.content_md)


if __name__ == '__main__':
    unittest.main()
