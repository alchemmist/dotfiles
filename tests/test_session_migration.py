import argparse
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("session_migration", ROOT / "migration/tmux-antex/migrate.py")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SessionMigrationTest(unittest.TestCase):
    def test_sqlite_backup_includes_committed_wal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / "state.sqlite"
            with sqlite3.connect(source) as db:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE turns (id INTEGER)")
                db.execute("INSERT INTO turns VALUES (42)")
                db.commit()
                self.assertGreater(Path(str(source) + "-wal").stat().st_size, 0)
                target = root / "backup.sqlite"
                MIGRATION.sqlite_copy(source, target)
                with sqlite3.connect(target) as restored:
                    self.assertEqual(restored.execute("SELECT id FROM turns").fetchall(), [(42,)])

    def test_snapshot_is_standalone_and_preserves_complete_jsonl(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve()
            state = home / ".antex"
            state.mkdir()
            (home / "settings.json").write_text('{"setting":true}')
            (state / "settings.json").symlink_to(home / "settings.json")
            (state / "session.jsonl").write_bytes(b'{"id":1}\n{"unfinished":')
            (state / "test.lock").write_text("runtime")
            bundle = home / "bundle"
            bundle.mkdir()
            archive = bundle / "state.tar.gz"
            records = []
            excluded = []
            with tarfile.open(archive, "w:gz") as tar:
                MIGRATION.archive_tree(home, state, ".antex", tar, records, excluded, bundle)
            manifest = {"format": 1, "archives": [{"file": archive.name, "root": ".antex", "sha256": MIGRATION.digest(archive), "files": records}]}
            MIGRATION.save_json(bundle / "manifest.json", manifest)
            (home / "settings.json").unlink()
            restored = home / "restored"
            MIGRATION.unpack(bundle, restored, MIGRATION.load_bundle(bundle))
            self.assertEqual((restored / ".antex/session.jsonl").read_bytes(), b'{"id":1}\n')
            self.assertEqual((restored / ".antex/settings.json").read_text(), '{"setting":true}')
            self.assertFalse((restored / ".antex/settings.json").is_symlink())
            self.assertFalse((restored / ".antex/test.lock").exists())

    def test_rejects_traversal_and_links(self):
        for name in ("../escape", "/absolute", "state/../../escape", ".", "a\\b"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                MIGRATION.safe_name(name)
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            archive = base / "evil.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo(".antex/link")
                member.type = tarfile.SYMTYPE
                member.linkname = "/outside"
                tar.addfile(member)
            manifest = {"archives": [{"file": archive.name, "root": ".antex", "files": []}]}
            with self.assertRaises(ValueError):
                MIGRATION.unpack(base, base / "output", manifest)

    def test_rejects_modified_archive_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            archive = base / "state.tar.gz"
            archive.write_bytes(b"original")
            manifest = {"format": 1, "archives": [{"root": ".antex", "file": archive.name, "sha256": MIGRATION.digest(archive), "files": []}]}
            MIGRATION.save_json(base / "manifest.json", manifest)
            archive.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"):
                MIGRATION.load_bundle(base)

    def test_rejects_overlapping_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            manifest = {"format": 1, "archives": [{"root": ".antex"}, {"root": ".antex/sessions"}]}
            MIGRATION.save_json(base / "manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "Overlapping"):
                MIGRATION.load_bundle(base)

    def test_launcher_keeps_package_companions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            binary = root / ".antex/packages/current/bin/antex"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(b"same-binary")
            helper = binary.with_name("antex-code-mode-host")
            helper.write_bytes(b"helper")
            launcher = root / ".local/bin/antex"
            launcher.parent.mkdir(parents=True)
            launcher.write_bytes(binary.read_bytes())
            MIGRATION.finalize_launchers(root, {"launchers": {".local/bin/antex": str(binary.relative_to(root))}})
            self.assertTrue(launcher.is_symlink())
            self.assertEqual(launcher.resolve(), binary)
            self.assertTrue(launcher.resolve().with_name("antex-code-mode-host").exists())

    def test_rehearsal_refuses_existing_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            bundle = root / "bundle"
            bundle.mkdir()
            MIGRATION.save_json(bundle / "manifest.json", {"format": 1, "archives": []})
            destination = root / "existing"
            destination.mkdir()
            sentinel = destination / "keep"
            sentinel.write_text("untouched")
            with self.assertRaisesRegex(ValueError, "must not exist"):
                MIGRATION.restore(argparse.Namespace(bundle=bundle, into=destination))
            self.assertEqual(sentinel.read_text(), "untouched")

    def test_jsonl_without_a_complete_record_is_empty(self):
        stream = io.BytesIO(b'{"incomplete"')
        self.assertEqual(MIGRATION.jsonl_size(stream, len(stream.getvalue())), 0)


if __name__ == "__main__":
    unittest.main()
