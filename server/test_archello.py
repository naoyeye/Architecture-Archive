import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse

import app as server
from article_payload import archello_original_image_url
from scraper import parse_article, supported_article_url
from test_scraper import snapshot, text_field

ARCHELLO_URL = 'https://archello.com/project/sample-house'
ORIGINAL = 'https://archello.s3.eu-central-1.amazonaws.com/images/2026/09/04/house.123.456.jpg'


def archello_snapshot():
    data = snapshot()
    data.update(source='archello', url=ARCHELLO_URL, expected_photo_count=1)
    data['photos'] = [{'id': urlparse(ORIGINAL).path, 'url': ORIGINAL, 'caption': text_field('Garden view. Photo: Sample Photographer', 'dom.archello.viewer.caption')}]
    return data


class ArchelloTests(unittest.TestCase):
    def test_route_source_and_image_identity(self):
        data = archello_snapshot()
        article = parse_article(ARCHELLO_URL, article_data=data)
        self.assertEqual(article.images[0].url, ORIGINAL)
        self.assertEqual(article.images[0].local_filename, '01.jpg')
        self.assertIn('Garden view. Photo: Sample Photographer', article.content_md)
        self.assertIn('## Project information', article.content_md)
        self.assertIn('## Credits', article.content_md)
        for url in [ARCHELLO_URL, ARCHELLO_URL + '/', ARCHELLO_URL + '?tracking=1#top']:
            self.assertTrue(supported_article_url(url))
        for url in ['http://archello.com/project/test', 'https://archello.com/project/', ARCHELLO_URL + '/1', 'https://archello.com/projects', 'https://archello.com.evil.test/project/test', 'https://user@archello.com/project/test', 'https://archello.com/story/123/attachments/photos-videos/1']:
            self.assertFalse(supported_article_url(url))
        data['source'] = 'dwell'
        with self.assertRaisesRegex(ValueError, 'source'):
            parse_article(ARCHELLO_URL, article_data=data)

    def test_original_allowlist_rejects_thumbnails_queries_credentials_and_encoded_paths(self):
        self.assertEqual(archello_original_image_url(ORIGINAL), ORIGINAL)
        for url in [ORIGINAL + '?w=225', ORIGINAL + '#fragment', ORIGINAL.replace('https:', 'http:'), ORIGINAL.replace('amazonaws.com', 'amazonaws.com.evil.test'), ORIGINAL.replace('https://', 'https://user@'), ORIGINAL.replace('/images/', '/thumbs/images/'), ORIGINAL.replace('house.123.456', '%2Fprivate'), ORIGINAL.replace('.jpg', '.svg'), 'https://archello.com/thumbs/images/2026/09/04/house.jpg']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                archello_original_image_url(url)

    def test_invalid_payloads_never_start_workers(self):
        valid = archello_snapshot()
        variants = []
        for field, value in [('source', 'dwell'), ('schema_version', 2), ('expected_photo_count', 2), ('url', ARCHELLO_URL + '-other')]:
            data = copy.deepcopy(valid)
            data[field] = value
            variants.append(data)
        for field, value in [('id', '/images/2026/09/04/other.jpg'), ('url', ORIGINAL + '?w=225')]:
            data = copy.deepcopy(valid)
            data['photos'][0][field] = value
            variants.append(data)
        for target in ['body', 'caption']:
            data = copy.deepcopy(valid)
            (data['body'] if target == 'body' else data['photos'][0]['caption'])['status'] = 'missing'
            variants.append(data)
        data = copy.deepcopy(valid)
        data['expected_photo_count'] = 2
        data['photos'] *= 2
        variants.append(data)
        data = copy.deepcopy(valid)
        data['auth'] = 'not allowed'
        variants.append(data)
        with patch.object(server.threading, 'Thread') as worker:
            for data in variants:
                response = server.app.test_client().post('/jobs', json={'url': ARCHELLO_URL, 'article': data})
                self.assertEqual(response.status_code, 400, response.get_json())
            response = server.app.test_client().post('/jobs', json={'url': ARCHELLO_URL, 'html': '<h1>Legacy HTML</h1>'})
            self.assertEqual(response.status_code, 400)
            worker.assert_not_called()

    def test_jobs_cors_and_built_script(self):
        client = server.app.test_client()
        with patch.object(server.threading, 'Thread') as worker:
            response = client.post('/jobs', json={'url': ARCHELLO_URL, 'article': archello_snapshot()}, headers={'Origin': 'https://archello.com'})
            self.assertEqual(response.status_code, 202, response.get_json())
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://archello.com')
            worker.return_value.start.assert_called_once()
        response = client.post('/jobs', json={'url': ARCHELLO_URL, 'article': archello_snapshot()}, headers={'Origin': 'https://archello.com.evil.test'})
        self.assertEqual(response.status_code, 403)
        response = client.get('/script.user.js')
        self.assertTrue(response.data.startswith(b'// ==UserScript=='))
        self.assertIn(b'// @match        https://archello.com/project/*', response.data)
        response.close()

    def test_worker_preserves_outputs_and_meta_with_mock_translation(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server, 'OUTPUT_ROOT', Path(directory)), \
                patch.object(server, '_refine_building_studio'), \
                patch.object(server, '_apply_folder_icon'), \
                patch.object(server, 'download_images', return_value=[Path('01.jpg')]), \
                patch.object(server, 'translate_text', return_value='示例住宅'), \
                patch.object(server, 'translate_markdown', side_effect=lambda text, **kwargs: text):
            job_id = server._new_job()
            server._run_job(job_id, ARCHELLO_URL, article_data=archello_snapshot())
            result = server._snapshot(job_id)
            self.assertEqual(result['status'], 'done', result)
            output = Path(result['dir'])
            self.assertTrue((output / 'article.zh.md').exists())
            self.assertFalse((output / 'article.cn.md').exists())
            self.assertIn('Garden view.', (output / 'article.md').read_text())
            meta = json.loads((output / 'meta.json').read_text())
            self.assertEqual(set(meta), {'url', 'title', 'building', 'studio', 'image_count', 'scraped_at'})


if __name__ == '__main__':
    unittest.main()
