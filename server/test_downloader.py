import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from downloader import _download_one


class OriginalDownloadTests(unittest.TestCase):
    @patch('downloader.requests.get')
    def test_dwell_referer_and_original_bytes(self, get):
        response = Mock()
        response.headers = {'Content-Type': 'image/jpeg'}
        response.iter_content.return_value = [b'original-image-bytes']
        get.return_value.__enter__.return_value = response
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '01.jpg'
            url = 'https://images2.dwell.com/photos/100/200/original.jpg'
            _download_one(url, target, timeout=10)
            self.assertEqual(target.read_bytes(), b'original-image-bytes')
            self.assertEqual(get.call_args.args[0], url)
            self.assertEqual(get.call_args.kwargs['headers']['Referer'], 'https://www.dwell.com/')
            self.assertNotIn('Cookie', get.call_args.kwargs['headers'])

    @patch('downloader.requests.get')
    def test_archello_referer_and_original_bytes(self, get):
        response = Mock()
        response.headers = {'Content-Type': 'image/jpeg'}
        response.iter_content.return_value = [b'archello-original-bytes']
        get.return_value.__enter__.return_value = response
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '01.jpg'
            url = 'https://archello.s3.eu-central-1.amazonaws.com/images/2026/09/04/photo.jpg'
            _download_one(url, target, timeout=10)
            self.assertEqual(target.read_bytes(), b'archello-original-bytes')
            self.assertEqual(get.call_args.args[0], url)
            self.assertEqual(get.call_args.kwargs['headers']['Referer'], 'https://archello.com/')
            self.assertNotIn('Cookie', get.call_args.kwargs['headers'])
            self.assertNotIn('Authorization', get.call_args.kwargs['headers'])

    @patch('downloader.requests.get')
    def test_html_is_not_saved_as_image(self, get):
        response = Mock()
        response.headers = {'Content-Type': 'text/html'}
        get.return_value.__enter__.return_value = response
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '01.jpg'
            with self.assertRaisesRegex(ValueError, 'did not return an image'):
                _download_one('https://images2.dwell.com/photos/100/200/original.jpg', target, timeout=10)
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
