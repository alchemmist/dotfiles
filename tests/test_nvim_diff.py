import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import nvim_diff


class NvimDiffTest(unittest.TestCase):
    def test_parse_unified_diff(self):
        diff = """diff --git a/src/a.py b/src/a.py
--- a/src/a.py
+++ b/src/a.py
@@ -1,2 +1,2 @@
 keep
-old
+new
diff --git a/new.txt b/new.txt
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+created
"""
        files = nvim_diff.parse_patch(diff)
        self.assertEqual([item.new_path for item in files], ["src/a.py", "new.txt"])
        self.assertEqual(files[0].old_lines, ["keep", "old"])
        self.assertEqual(files[0].new_lines, ["keep", "new"])
        self.assertIsNone(files[1].old_path)

    def test_parse_normal_diff(self):
        files = nvim_diff.parse_normal_diff("1c1\n< old\n---\n> new\n")
        self.assertEqual(files[0].old_lines, ["old"])
        self.assertEqual(files[0].new_lines, ["new"])

    def test_arc_snapshots(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            before = Path(temp) / "before"
            after = Path(temp) / "after"
            root.mkdir()
            before.mkdir()
            after.mkdir()
            (root / "modified.txt").write_bytes(b"new")
            (root / "new.txt").write_bytes(b"created")
            status = {
                "status": {
                    "changed": [
                        {"path": "modified.txt", "status": "modified", "type": "file"},
                        {"path": "new.txt", "status": "untracked", "type": "file"},
                        {"path": "deleted.txt", "status": "deleted", "type": "file"},
                    ]
                }
            }

            def fake_run(args, cwd):
                if args[1] == "status":
                    return subprocess.CompletedProcess(
                        args, 0, json.dumps(status).encode(), b""
                    )
                contents = {
                    "HEAD:modified.txt": (0, b"old"),
                    "HEAD:new.txt": (1, b""),
                    "HEAD:deleted.txt": (0, b"deleted"),
                }
                code, output = contents[args[2]]
                return subprocess.CompletedProcess(args, code, output, b"")

            with patch.object(nvim_diff, "run", side_effect=fake_run):
                files = nvim_diff.arc_snapshots(root, before, after)

            self.assertEqual(files, ["deleted.txt", "modified.txt", "new.txt"])
            self.assertEqual((before / "modified.txt").read_bytes(), b"old")
            self.assertEqual((after / "modified.txt").read_bytes(), b"new")
            self.assertFalse((before / "new.txt").exists())
            self.assertEqual((after / "new.txt").read_bytes(), b"created")
            self.assertEqual((before / "deleted.txt").read_bytes(), b"deleted")
            self.assertFalse((after / "deleted.txt").exists())

            filtered_before = Path(temp) / "filtered-before"
            filtered_after = Path(temp) / "filtered-after"
            filtered_before.mkdir()
            filtered_after.mkdir()
            with patch.object(nvim_diff, "run", side_effect=fake_run):
                filtered = nvim_diff.arc_snapshots(
                    root, filtered_before, filtered_after, ["modified.txt"]
                )
            self.assertEqual(filtered, ["modified.txt"])
            self.assertEqual((filtered_before / "modified.txt").read_bytes(), b"old")
            self.assertEqual((filtered_after / "modified.txt").read_bytes(), b"new")

    def test_repository_path_stays_inside_root(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertIsNone(nvim_diff.repository_path(root, "../secret"))
            self.assertEqual(
                nvim_diff.repository_path(root, "a/file"), (root / "a/file").resolve()
            )

    def test_normalize_repository_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "repo"
            cwd = root / "nested"
            cwd.mkdir(parents=True)
            self.assertEqual(
                nvim_diff.normalize_repository_paths(root, cwd, ["file.txt"]),
                ["nested/file.txt"],
            )
            with self.assertRaises(ValueError):
                nvim_diff.normalize_repository_paths(root, cwd, ["../../outside"])

    def test_path_selected(self):
        self.assertTrue(nvim_diff.path_selected("dir/file.txt", ["dir"]))
        self.assertTrue(nvim_diff.path_selected("dir/file.txt", ["dir/file.txt"]))
        self.assertFalse(nvim_diff.path_selected("other/file.txt", ["dir"]))

    def test_github_pr_patch_uses_branch_and_pr_diff(self):
        responses = [
            (0, '{"number": 123}', ""),
            (0, "diff --git a/file.txt b/file.txt\n", ""),
        ]
        with patch.object(nvim_diff, "command_text", side_effect=responses) as command:
            patch_text, error = nvim_diff.github_pr_patch(Path("/repo"), "feature")

        self.assertIsNone(error)
        self.assertIn("diff --git", patch_text)
        self.assertEqual(command.call_args_list[0].args[0], ["gh", "pr", "view", "feature", "--json", "number"])
        self.assertEqual(command.call_args_list[1].args[0], ["gh", "pr", "diff", "123", "--patch", "--color", "never"])

    def test_arc_pr_patch_resolves_nested_pr_id(self):
        responses = [
            (0, '{"pull_request": {"id": 456}}', ""),
            (0, "diff --git a/file.txt b/file.txt\n", ""),
        ]
        with patch.object(nvim_diff, "command_text", side_effect=responses) as command:
            patch_text, error = nvim_diff.arc_pr_patch(Path("/repo"), "users/me/feature")

        self.assertIsNone(error)
        self.assertIn("diff --git", patch_text)
        self.assertEqual(command.call_args_list[0].args[0], ["arc", "pr", "status", "--json", "users/me/feature"])
        self.assertEqual(command.call_args_list[1].args[0], ["arc", "pr", "changes", "456"])

    def test_display_patch_dry_run_contains_all_files(self):
        diff = """diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1 @@
-old
+new
"""
        with patch("builtins.print") as output:
            result = nvim_diff.display_patch(diff, Path("/repo"), True, "PR")

        self.assertEqual(result, 0)
        rendered = output.call_args.args[0]
        self.assertEqual(json.loads(rendered)["files"], ["a.txt", "b.txt"])

    def test_repository_pr_mode_fetches_diff_for_current_branch(self):
        with (
            patch.object(nvim_diff, "repository", return_value=("git", Path("/repo"))),
            patch.object(nvim_diff, "current_branch", return_value="feature"),
            patch.object(nvim_diff, "pull_request_patch", return_value=("patch", None)) as fetch,
            patch.object(nvim_diff, "display_patch", return_value=0) as display,
        ):
            result = nvim_diff.repository_main(["--dry-run", "pr"])

        self.assertEqual(result, 0)
        fetch.assert_called_once_with("git", Path("/repo"), "feature")
        display.assert_called_once_with("patch", Path("/repo"), True, "PR for feature")


if __name__ == "__main__":
    unittest.main()
