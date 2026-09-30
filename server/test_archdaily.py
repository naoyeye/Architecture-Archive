import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import app as server
from article_payload import archdaily_large_image_url
from downloader import _download_one
from scraper import parse_article, supported_article_url
from test_scraper import snapshot, text_field

PROJECT_URL = 'https://www.archdaily.com/1027911/sample-house'
IMAGE_ID = '67d1c9ebc0be690189b3af4d'
LARGE = 'https://images.adsttc.com/media/images/67d1/c9eb/c0be/6901/89b3/af4d/slideshow/house.jpg?1741802004'


def archdaily_snapshot():
    data = snapshot()
    data.update(source='archdaily', url=PROJECT_URL, expected_photo_count=1)
    data['photos'] = [{'id': IMAGE_ID, 'url': LARGE, 'caption': text_field('© Photographer', 'dom.archdaily-gallery')}]
    return data


class ArchdailyTests(unittest.TestCase):
    def test_route_and_markdown(self):
        article = parse_article(PROJECT_URL, article_data=archdaily_snapshot())
        self.assertEqual(article.images[0].url, LARGE)
        self.assertEqual(article.images[0].local_filename, '01.jpg')
        self.assertIn('© Photographer', article.content_md)
        for url in [PROJECT_URL, PROJECT_URL + '/', PROJECT_URL + '?tracking=1#top']:
            self.assertTrue(supported_article_url(url))
        for url in [PROJECT_URL + '/photo', PROJECT_URL.replace('/1027911/', '/news/'), PROJECT_URL.replace('https:', 'http:'), PROJECT_URL.replace('www.archdaily.com', 'www.archdaily.com.evil.test'), PROJECT_URL.replace('https://', 'https://user@'), 'https://www.archdaily.com/']:
            self.assertFalse(supported_article_url(url))

    def test_image_allowlist(self):
        self.assertEqual(archdaily_large_image_url(LARGE), LARGE)
        for url in [LARGE.replace('/slideshow/', '/medium_jpg/'), LARGE + '&w=100', LARGE + '#fragment', LARGE.replace('https:', 'http:'), LARGE.replace('https://', 'https://user@'), LARGE.replace('images.adsttc.com', 'evil.test'), LARGE.replace('house.jpg', '%2Fhouse.jpg'), LARGE.replace('.jpg', '.svg')]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                archdaily_large_image_url(url)

    def test_invalid_data_never_starts_workers(self):
        variants = []
        for field, value in [('source', 'dwell'), ('expected_photo_count', 2), ('url', PROJECT_URL + '-other')]:
            data = archdaily_snapshot()
            data[field] = value
            variants.append(data)
        for field, value in [('id', 'other'), ('url', LARGE.replace('/slideshow/', '/thumb_jpg/')), ('caption', {'status': 'missing'})]:
            data = archdaily_snapshot()
            data['photos'][0][field] = value
            variants.append(data)
        duplicate = archdaily_snapshot()
        duplicate['photos'].append(copy.deepcopy(duplicate['photos'][0]))
        duplicate['expected_photo_count'] = 2
        variants.append(duplicate)
        with patch.object(server.threading, 'Thread') as worker:
            for data in variants:
                response = server.app.test_client().post('/jobs', json={'url': PROJECT_URL, 'article': data})
                self.assertEqual(response.status_code, 400, response.get_json())
            response = server.app.test_client().post('/jobs', json={'url': PROJECT_URL, 'html': '<h1>Legacy HTML</h1>'})
            self.assertEqual(response.status_code, 400)
            worker.assert_not_called()

    def test_cors_and_script(self):
        client = server.app.test_client()
        with patch.object(server.threading, 'Thread') as worker:
            response = client.post('/jobs', json={'url': PROJECT_URL, 'article': archdaily_snapshot()}, headers={'Origin': 'https://www.archdaily.com'})
            self.assertEqual(response.status_code, 202, response.get_json())
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://www.archdaily.com')
            worker.return_value.start.assert_called_once()
        response = client.post('/jobs', json={'url': PROJECT_URL, 'article': archdaily_snapshot()}, headers={'Origin': 'https://www.archdaily.com.evil.test'})
        self.assertEqual(response.status_code, 403)
        response = client.get('/script.user.js')
        self.assertTrue(response.data.startswith(b'// ==UserScript=='))
        self.assertIn(b'// @match        https://www.archdaily.com/*', response.data)
        response.close()

    def test_worker_outputs_with_mock_translation(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server, 'OUTPUT_ROOT', Path(directory)), \
                patch.object(server, '_refine_building_studio'), \
                patch.object(server, '_apply_folder_icon'), \
                patch.object(server, 'download_images', return_value=[Path('01.jpg')]), \
                patch.object(server, 'translate_text', return_value='示例住宅'), \
                patch.object(server, 'translate_markdown', side_effect=lambda text, **kwargs: text):
            job_id = server._new_job()
            server._run_job(job_id, PROJECT_URL, article_data=archdaily_snapshot())
            result = server._snapshot(job_id)
            self.assertEqual(result['status'], 'done', result)
            output = Path(result['dir'])
            self.assertTrue((output / 'article.zh.md').exists())
            self.assertFalse((output / 'article.cn.md').exists())
            self.assertIn('© Photographer', (output / 'article.md').read_text())
            meta = json.loads((output / 'meta.json').read_text())
            self.assertEqual(set(meta), {'url', 'title', 'building', 'studio', 'image_count', 'scraped_at'})

    def test_downloader_referer_and_html_rejection(self):
        with tempfile.TemporaryDirectory() as directory, patch('downloader.requests.get') as request:
            response = MagicMock()
            request.return_value.__enter__.return_value = response
            response.headers = {'Content-Type': 'image/jpeg'}
            response.iter_content.return_value = [b'fake image']
            target = Path(directory) / '01.jpg'
            _download_one(LARGE, target, 5)
            self.assertEqual(request.call_args.kwargs['headers']['Referer'], 'https://www.archdaily.com/')
            self.assertEqual(target.read_bytes(), b'fake image')
            response.headers = {'Content-Type': 'text/html'}
            with self.assertRaisesRegex(ValueError, 'image'):
                _download_one(LARGE, Path(directory) / 'error.jpg', 5)
            self.assertFalse((Path(directory) / 'error.jpg').exists())


if __name__ == '__main__':
    unittest.main()
