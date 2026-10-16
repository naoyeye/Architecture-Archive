import unittest

from metric_units import add_metric_conversions


class MetricUnitTests(unittest.TestCase):
    def test_numeric_units_and_chinese_numbers(self):
        source = (
            "874平方英尺；2，153平方英尺；11英尺；四乘四英寸；"
            "50英里；18英亩；约两英尺半；32×12英尺"
        )
        expected = (
            "874平方英尺（81.2平方米）；2，153平方英尺（200.0平方米）；"
            "11英尺（3.4米）；四乘四英寸（10.2乘10.2厘米）；"
            "50英里（80.5公里）；18英亩（7.28公顷）；"
            "约两英尺半（约0.8米）；32×12英尺（9.8×3.7米）"
        )
        self.assertEqual(add_metric_conversions(source), expected)

    def test_existing_conversions_and_unknown_quantities_stay_unchanged(self):
        source = (
            "890平方英尺（83平方米）；九英尺高（2.7米）；"
            "38平方米（409平方英尺）；数百英尺；数十英尺；几百英尺；几英尺"
        )
        self.assertEqual(add_metric_conversions(source), source)
        translated = add_metric_conversions("840平方英尺")
        self.assertEqual(add_metric_conversions(translated), translated)

    def test_markdown_links_and_table_values(self):
        source = (
            "[840平方英尺](https://example.com/840平方英尺)\n"
            "![840平方英尺](<images/840平方英尺 (1).jpg>)\n"
            "| 平方英尺 | 1937.5 |\n"
            "| 平方英尺 | 1937.5（180.0平方米） |\n"
        )
        expected = (
            "[840平方英尺（78.0平方米）](https://example.com/840平方英尺)\n"
            "![840平方英尺（78.0平方米）](<images/840平方英尺 (1).jpg>)\n"
            "| 平方英尺 | 1937.5（180.0平方米） |\n"
            "| 平方英尺 | 1937.5（180.0平方米） |\n"
        )
        self.assertEqual(add_metric_conversions(source), expected)
        self.assertEqual(add_metric_conversions(expected), expected)


if __name__ == "__main__":
    unittest.main()
