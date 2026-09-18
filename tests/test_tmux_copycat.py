import shlex
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

PLUGIN = Path.home() / '.tmux/plugins/tmux-copycat'
CONFIG = Path(__file__).resolve().parents[1] / 'tmux/.tmux.conf'


class CopycatUrlTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which('tmux') and PLUGIN.is_dir(), 'tmux-copycat is not installed')
    def test_search_is_limited_to_two_screens(self):
        with tempfile.TemporaryDirectory(prefix='copycat-history-') as folder:
            root = Path(folder)
            fixture = root / 'text'
            fixture.write_text('https://example.com/old\n' + 'older output\n' * 200 + 'https://example.com/above\n' + 'recent output\n' * 28 + 'https://example.com/current https://example.com/current\nREADY\n')

            def tm(*args):
                return subprocess.check_output(['tmux', '-S', str(root / 'socket'), *args], text=True)

            tm('-f', '/dev/null', 'new-session', '-d', '-x', '140', '-y', '24')
            try:
                tm('set-option', '-g', 'mode-keys', 'vi')
                tm('send-keys', 'cat ' + shlex.quote(str(fixture)), 'Enter')
                for attempt in range(100):
                    if 'READY' in tm('capture-pane', '-p'):
                        break
                    time.sleep(.05)
                else:
                    self.fail('Fixture did not appear in tmux')
                tm('run-shell', str(PLUGIN / 'scripts/copycat_mode_start.sh') + " 'https?://[a-z./]+'")
                tm('send-keys', '-X', 'copy-selection-no-clear')
                self.assertEqual(tm('show-buffer').strip(), 'https://example.com/current')
                self.assertEqual(tm('display-message', '-p', '#{scroll_position}').strip(), '0')
                first_x = int(tm('display-message', '-p', '#{copy_cursor_x}'))
                tm('run-shell', str(PLUGIN / 'scripts/copycat_jump.sh') + ' next')
                tm('send-keys', '-X', 'copy-selection-no-clear')
                self.assertEqual(tm('show-buffer').strip(), 'https://example.com/current')
                self.assertGreater(int(tm('display-message', '-p', '#{copy_cursor_x}')), first_x)
                self.assertEqual(tm('display-message', '-p', '#{scroll_position}').strip(), '0')
                tm('run-shell', str(PLUGIN / 'scripts/copycat_jump.sh') + ' next')
                tm('send-keys', '-X', 'copy-selection-no-clear')
                self.assertEqual(tm('show-buffer').strip(), 'https://example.com/above')
                tm('run-shell', str(PLUGIN / 'scripts/copycat_jump.sh') + ' next')
                tm('send-keys', '-X', 'copy-selection-no-clear')
                self.assertEqual(tm('show-buffer').strip(), 'https://example.com/above')
                tm('run-shell', str(PLUGIN / 'scripts/copycat_jump.sh') + ' prev')
                tm('send-keys', '-X', 'copy-selection-no-clear')
                self.assertEqual(tm('show-buffer').strip(), 'https://example.com/current')
            finally:
                tm('kill-server')

    @unittest.skipUnless(shutil.which('tmux') and PLUGIN.is_dir(), 'tmux-copycat is not installed')
    def test_url_selection(self):
        cases = [
            ('• Реализовано: PR 15780004 (https://a.yandex-team.ru/review/15780004).', 'https://a.yandex-team.ru/review/15780004'),
            ('Ссылка: https://example.com/path.', 'https://example.com/path'),
            ('🚀 链接 https://example.com/unicode', 'https://example.com/unicode'),
            ('[Документ](https://example.com/path)', 'https://example.com/path'),
            ('Запрос https://example.com/search?q=one&lang=ru#part, готово', 'https://example.com/search?q=one&lang=ru#part'),
            ('Статья (https://en.wikipedia.org/wiki/Function_(mathematics)).', 'https://en.wikipedia.org/wiki/Function_(mathematics)'),
        ]
        for line, expected in cases:
            with self.subTest(line=line), tempfile.TemporaryDirectory(prefix='copycat-url-') as folder:
                socket = str(Path(folder) / 'socket')
                fixture = Path(folder) / 'text'
                fixture.write_text(line + '\n')

                def tm(*args):
                    return subprocess.check_output(['tmux', '-S', socket, *args], text=True)

                tm('-f', '/dev/null', 'new-session', '-d', '-x', '160', '-y', '24')
                try:
                    tm('set-option', '-g', 'mode-keys', 'vi')
                    options = Path(folder) / 'options.conf'
                    options.write_text('\n'.join(row for row in CONFIG.read_text().splitlines() if row.startswith('set -g @copycat_')))
                    tm('source-file', str(options))
                    tm('run-shell', str(PLUGIN / 'copycat.tmux'))
                    tm('send-keys', 'cat ' + shlex.quote(str(fixture)), 'Enter')
                    for attempt in range(100):
                        if line in tm('capture-pane', '-p'):
                            break
                        time.sleep(.05)
                    else:
                        self.fail('Fixture did not appear in tmux')
                    binding = next(parts for row in tm('list-keys', '-T', 'prefix').splitlines() if len(parts := shlex.split(row)) > 4 and parts[3] == 'u')
                    command = binding[binding.index('run-shell') + 1]
                    tm('run-shell', command)
                    tm('send-keys', '-X', 'copy-selection-no-clear')
                    self.assertEqual(tm('show-buffer').strip(), expected)
                finally:
                    tm('kill-server')


if __name__ == '__main__':
    unittest.main()
