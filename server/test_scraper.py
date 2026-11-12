import copy
import unittest
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup
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

    def test_inline_article_photos_use_validated_local_files_and_captions(self):
        data = snapshot()
        data['url'] = DWELL_URL.replace('/home/', '/article/')
        data['body'] = text_field(
            '<h4>Before</h4><figure data-archive-photo-id="201"></figure>'
            '<p>Between.</p><h4>After</h4>'
            '<figure data-archive-photo-id="200"></figure>'
            '<p>ARCHIVEPHOTOREFERENCE0END</p>',
            'state.story.body', 'html',
        )
        article = parse_article(data['url'], article_data=data)
        self.assertRegex(article.content_md, r'Before\s+!\[\]\(images/02.jpg\)\s+Between')
        self.assertRegex(article.content_md, r'After\s+!\[\]\(images/01.jpg\)\s+Ocean \*view\*')
        self.assertIn('ARCHIVEPHOTOREFERENCE0END', article.content_md)
        self.assertNotIn('## Photos', article.content_md)
        self.assertNotIn('data-archive-photo-id', article.content_md)
        self.assertEqual(len(article.images), 2)

    def test_invalid_inline_references_are_rejected(self):
        for markup in [
            '<figure data-archive-photo-id="999"></figure>',
            '<figure data-archive-photo-id="200" title="extra"></figure>',
            '<figure data-archive-photo-id="200">Unknown content</figure>',
            '<figure data-archive-photo-id="200"><span></span></figure>',
            '<div data-archive-photo-id="200"></div>',
            '<figure data-archive-photo-id=""></figure>',
        ]:
            data = snapshot()
            data['url'] = DWELL_URL.replace('/home/', '/article/')
            data['body'] = text_field(markup, 'state.story.body', 'html')
            with self.subTest(markup=markup), self.assertRaisesRegex(ValueError, 'inline photo'):
                parse_article(data['url'], article_data=data)
        data = snapshot()
        data['body'] = text_field('<figure data-archive-photo-id="200"></figure>', format='html')
        with self.assertRaisesRegex(ValueError, 'inline photo'):
            parse_article(data['url'], article_data=data)

    def test_photo_only_article_retains_empty_caption_and_gallery_only_cover(self):
        data = snapshot()
        data['url'] = DWELL_URL.replace('/home/', '/article/')
        data['body'] = text_field('<figure data-archive-photo-id="201"></figure>', format='html')
        article = parse_article(data['url'], article_data=data)
        self.assertTrue(article.content_md.startswith('## Description\n\n![](images/02.jpg)\n'))
        self.assertEqual(article.content_md.count('images/02.jpg'), 1)
        self.assertIn('## Photos\n\n![](images/01.jpg)', article.content_md)
        self.assertIsNone(article.images[1].caption)

    def test_inline_reference_cannot_supply_unconfirmed_originals_or_captions(self):
        for field in ['url', 'caption']:
            data = snapshot()
            data['url'] = DWELL_URL.replace('/home/', '/article/')
            data['body'] = text_field('<figure data-archive-photo-id="200"></figure>', format='html')
            if field == 'url':
                data['photos'][0]['url'] = ORIGINAL.replace('original', 'small')
            else:
                data['photos'][0]['caption']['status'] = 'missing'
            with self.subTest(field=field), self.assertRaises(ValueError):
                parse_article(data['url'], article_data=data)

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

    def test_dezeen_redesign_preserves_gallery_captions_and_body_order(self):
        html = Path(__file__).with_name('fixtures').joinpath('dezeen-redesign.html').read_text()
        article = parse_article('https://www.dezeen.com/2026/10/29/sample/', html)
        self.assertEqual(article.building, 'Sample House')
        self.assertEqual(article.studio, 'Example Studio')
        self.assertEqual([image.url.rsplit('/', 1)[-1] for image in article.images],
                         ['hero.jpg', 'interior.jpg', 'plan.jpg', 'section.jpg'])
        self.assertEqual([image.caption for image in article.images],
                         [None, 'Living room', 'Plan', 'Section'])
        content = article.content_md
        ordered = ['A house above the lake.', 'images/02 - Living room.jpg',
                   '### Drawings', 'images/03 - Plan.jpg', 'images/04 - Section.jpg',
                   'The tall void connects both floors.', 'Photography by Example Photographer.']
        self.assertEqual(sorted(content.index(part) for part in ordered),
                         [content.index(part) for part in ordered])
        self.assertEqual(content.count('images/03 - Plan.jpg'), 1)
        self.assertEqual(content.count('images/02 - Living room.jpg'), 2)
        for unwanted in ['Wrong project', 'sidebar.jpg', 'recommended.jpg',
                         'Previous', 'Next', 'Close', 'Facebook', 'Read more']:
            self.assertNotIn(unwanted, content)

    def test_dezeen_redesign_rejects_incomplete_body_and_gallery(self):
        html = Path(__file__).with_name('fixtures').joinpath('dezeen-redesign.html').read_text()
        for mode in ['missing-body', 'empty-body', 'empty-gallery', 'partial-gallery', 'missing-image',
                     'missing-url', 'missing-modal', 'wrong-modal-image']:
            with self.subTest(mode=mode):
                soup = BeautifulSoup(html, 'lxml')
                if mode == 'missing-body':
                    soup.select_one('.single-content__content').decompose()
                elif mode == 'empty-body':
                    soup.select_one('.single-content__content').clear()
                elif mode == 'empty-gallery':
                    soup.select_one('.gallery-slider__slider ul').clear()
                elif mode == 'partial-gallery':
                    soup.select_one('.gallery-slider__slide').decompose()
                elif mode == 'missing-image':
                    soup.select_one('.gallery-slider__slide img').decompose()
                elif mode == 'missing-url':
                    soup.select_one('.gallery-slider__slide img').attrs.clear()
                elif mode == 'missing-modal':
                    soup.select_one('#drawings-modal').decompose()
                else:
                    soup.select_one('#drawings-modal figure').decompose()
                with self.assertRaisesRegex(ValueError, 'Dezeen'):
                    parse_article('https://www.dezeen.com/2026/10/29/sample/', str(soup))

    def test_dezeen_legacy_lightbox_deduplicates_and_preserves_captions(self):
        html = '''<article><h1>Sample House by Example Studio</h1>
        <header><figure><img src="https://static.dezeen.com/house-800x600.jpg"></figure></header>
        <div class="main-article-body"><p>A house.</p><figure><img src="https://static.dezeen.com/house.jpg"><figcaption>Outside</figcaption></figure>
        <div class="related-in-article-wrapper"><figure><img src="https://static.dezeen.com/other.jpg"></figure><p>Read a different story</p></div></div></article>
        <div class="extra-lightbox-images"><a data-lightboximage="https://static.dezeen.com/house.jpg"></a><a data-lightboximage="https://static.dezeen.com/plan.jpg"></a></div>'''
        article = parse_article('https://www.dezeen.com/2026/09/10/sample/', html)
        self.assertEqual(len(article.images), 2)
        self.assertEqual(article.images[0].caption, 'Outside')
        self.assertNotIn('different story', article.content_md)
        self.assertIn('images/01 - Outside.jpg', article.content_md)

    def test_dezeen_gallery_clones_and_unrelated_projects_cannot_change_capture(self):
        html = Path(__file__).with_name('fixtures').joinpath('dezeen-redesign.html').read_text()
        soup = BeautifulSoup(html, 'lxml')
        first_slide = soup.select_one('.gallery-slider__slide')
        first_slide.parent.append(copy.deepcopy(first_slide))
        sidebar = soup.select_one('.single-content__aside')
        for _ in range(12):
            img = soup.new_tag('img', alt='Wrong house by Wrong studio')
            sidebar.append(img)
        # Recommendations can occur before the main article in document order.
        soup.body.insert(0, soup.select_one('.dez-recommendations').extract())
        soup.body.append(BeautifulSoup('<div class="gallery-slider__slider"><img src="https://static-2026.dezeen.com/other-gallery.jpg"></div>', 'lxml'))
        article = parse_article('https://www.dezeen.com/2026/10/29/sample/', str(soup))
        self.assertEqual(article.building, 'Sample House')
        self.assertEqual(article.studio, 'Example Studio')
        self.assertEqual(len(article.images), 4)
        self.assertEqual(article.content_md.count('images/03 - Plan.jpg'), 1)


if __name__ == '__main__':
    unittest.main()
