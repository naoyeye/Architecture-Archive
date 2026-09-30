"""Regression tests for translation provider requests and retries."""
from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, call, patch

import requests

import analyzer
import translator


class DeepSeekRequestTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {"TRANSLATE_MAX_CHARS": "8000", "TRANSLATE_READ_TIMEOUT": "240"},
        clear=True,
    )
    def test_translation_limits_are_configurable(self) -> None:
        self.assertEqual(translator._chunk_limit(), 8000)
        self.assertEqual(translator._request_timeout(), (10.0, 240.0))

    @patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}, clear=True)
    @patch("translator.requests.post")
    def test_translation_disables_thinking_and_uses_v4_default(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {
            "choices": [{"message": {"content": "translated"}}]
        }
        post.return_value = response

        result = translator._translate_with_deepseek("source")

        self.assertEqual(result, "translated")
        request = post.call_args
        self.assertEqual(request.kwargs["json"]["model"], "deepseek-v4-flash")
        self.assertEqual(
            request.kwargs["json"]["thinking"],
            {"type": "disabled"},
        )
        self.assertEqual(request.kwargs["timeout"], (10.0, 180.0))

    @patch.dict(
        os.environ,
        {"DEEPSEEK_API_KEY": "test-key", "DEEPSEEK_MODEL": "deepseek-v4-pro"},
        clear=True,
    )
    @patch("translator.requests.post")
    def test_translation_accepts_v4_pro_from_environment(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {
            "choices": [{"message": {"content": "translated"}}]
        }
        post.return_value = response

        translator._translate_with_deepseek("source")

        request = post.call_args
        self.assertEqual(request.kwargs["json"]["model"], "deepseek-v4-pro")

    @patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}, clear=True)
    @patch("analyzer.requests.post")
    def test_analyzer_disables_thinking(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {
            "choices": [{"message": {"content": '{"building": null, "studio": null}'}}]
        }
        post.return_value = response

        analyzer._call_deepseek("prompt", timeout=45.0)

        request = post.call_args
        self.assertEqual(request.kwargs["json"]["model"], "deepseek-v4-flash")
        self.assertEqual(
            request.kwargs["json"]["thinking"],
            {"type": "disabled"},
        )


class RetryTests(unittest.TestCase):
    @patch("translator._wait_before_retry")
    @patch("translator._translate_once")
    def test_timeout_waits_only_between_attempts(
        self,
        translate_once: Mock,
        wait_before_retry: Mock,
    ) -> None:
        translate_once.side_effect = requests.exceptions.ReadTimeout("slow")

        result = translator._translate_with_retry("source")

        self.assertIsNone(result)
        self.assertEqual(translate_once.call_count, 4)
        self.assertEqual(
            wait_before_retry.call_args_list,
            [call(1.0, None), call(2.0, None), call(4.0, None)],
        )

    @patch("translator._wait_before_retry")
    @patch("translator._translate_once")
    def test_client_error_is_not_retried(
        self,
        translate_once: Mock,
        wait_before_retry: Mock,
    ) -> None:
        response = Mock(status_code=422)
        translate_once.side_effect = requests.exceptions.HTTPError(
            "invalid parameters",
            response=response,
        )

        result = translator._translate_with_retry("source")

        self.assertIsNone(result)
        translate_once.assert_called_once()
        wait_before_retry.assert_not_called()


if __name__ == "__main__":
    unittest.main()
