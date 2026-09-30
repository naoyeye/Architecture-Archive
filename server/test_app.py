import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as server
from test_scraper import DWELL_URL, snapshot


class ServerTests(unittest.TestCase):
    def test_routes_and_origin_validation(self):
        client = server.app.test_client()
        with patch.object(server.threading, 'Thread') as worker:
            response = client.post('/jobs', json={'url': DWELL_URL, 'article': snapshot()}, headers={'Origin': 'https://www.dwell.com'})
            self.assertEqual(response.status_code, 202)
            worker.return_value.start.assert_called_once()
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://www.dwell.com')
        self.assertEqual(client.post('/jobs', json={'url': DWELL_URL, 'article': snapshot()}, headers={'Origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(client.post('/jobs', json={'url': 'https://www.dwell.com/article/test', 'html': '<h1>Hi</h1>'}).status_code, 400)
        script = client.get('/script.user.js')
        self.assertEqual(script.status_code, 200)
        self.assertIn(b'Architecture Archive', script.data)
        script.close()

    def test_article_jobs_and_built_script(self):
        data = snapshot()
        data['url'] = 'https://www.dwell.com/article/sample-cabin'
        with patch.object(server.threading, 'Thread') as worker:
            response = server.app.test_client().post('/jobs', json={'url': data['url'], 'article': data})
            self.assertEqual(response.status_code, 202)
            worker.return_value.start.assert_called_once()
        self.assertEqual(server.USERSCRIPT_PATH.parent.name, 'tampermonkey')
        response = server.app.test_client().get('/script.user.js')
        self.assertTrue(response.data.startswith(b'// ==UserScript=='))
        self.assertIn(b'https://www.dwell.com/article/*', response.data)
        response.close()

    def test_invalid_dwell_payload_is_rejected_before_starting_worker(self):
        client = server.app.test_client()
        invalid_requests = [None, [], {'url': DWELL_URL, 'html': '<h1>Old script</h1>'}]
        for field, value in [('schema_version', 2), ('photos', []), ('url', DWELL_URL + '-other')]:
            data = snapshot()
            data[field] = value
            invalid_requests.append({'url': DWELL_URL, 'article': data})
        data = snapshot()
        data['body']['status'] = 'missing'
        invalid_requests.append({'url': DWELL_URL, 'article': data})
        with patch.object(server.threading, 'Thread') as worker:
            for request_data in invalid_requests:
                with self.subTest(data=request_data):
                    self.assertEqual(client.post('/jobs', json=request_data).status_code, 400)
            worker.assert_not_called()

    def test_dezeen_html_route_is_preserved(self):
        with patch.object(server.threading, 'Thread') as worker:
            response = server.app.test_client().post('/jobs', json={
                'url': 'https://www.dezeen.com/2026/09/10/sample/',
                'html': '<article><h1>Sample</h1></article>',
            })
            self.assertEqual(response.status_code, 202)
            worker.return_value.start.assert_called_once()

    def test_worker_outputs_single_chinese_file_and_minimal_meta(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server, 'OUTPUT_ROOT', Path(directory)), \
                patch.object(server, '_refine_building_studio'), \
                patch.object(server, '_apply_folder_icon'), \
                patch.object(server, 'download_images', return_value=[Path('01.jpg'), Path('02.jpg')]), \
                patch.object(server, 'translate_text', return_value='示例住宅'), \
                patch.object(server, 'translate_markdown', side_effect=lambda text, **kwargs: text.replace('Ocean', '海洋')):
            job_id = server._new_job()
            server._run_job(job_id, DWELL_URL, article_data=snapshot())
            result = server._snapshot(job_id)
            self.assertEqual(result['status'], 'done')
            output = Path(result['dir'])
            self.assertFalse((output / 'article.cn.md').exists())
            self.assertIn('海洋', (output / 'article.zh.md').read_text())
            self.assertIn('## Credits', (output / 'article.md').read_text())
            meta = json.loads((output / 'meta.json').read_text())
            self.assertEqual(set(meta), {'url', 'title', 'building', 'studio', 'image_count', 'scraped_at'})

    def test_failed_download_is_not_success(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server, 'OUTPUT_ROOT', Path(directory)), \
                patch.object(server, '_refine_building_studio'), \
                patch.object(server, 'download_images', return_value=[]), \
                patch.object(server, 'translate_text') as translate:
            job_id = server._new_job()
            with self.assertLogs('architecture_archive', level='ERROR'):
                server._run_job(job_id, DWELL_URL, article_data=snapshot())
            self.assertEqual(server._snapshot(job_id)['status'], 'error')
            translate.assert_not_called()

    def test_apply_folder_icon_logs_script_stderr_on_failure(self):
        job_id = server._new_job()
        stderr = "Missing 'fileicon'. Install first: brew install fileicon"
        with patch.object(server, 'AUTO_SET_FOLDER_ICON', True), \
                patch.object(server, 'ICON_SCRIPT') as icon_script, \
                patch.object(
                    server.subprocess,
                    'run',
                    side_effect=subprocess.CalledProcessError(1, ['icon.sh'], stderr=stderr),
                ):
            icon_script.exists.return_value = True
            server._apply_folder_icon(Path('/tmp/case-dir'), job_id)
        result = server._snapshot(job_id)
        folder_stage = next(s for s in result['stages'] if s['key'] == 'folder_icon')
        self.assertEqual(folder_stage['state'], 'error')
        self.assertEqual(folder_stage['detail'], stderr)
        self.assertTrue(any(stderr in line for line in result['logs']))


if __name__ == '__main__':
    unittest.main()
