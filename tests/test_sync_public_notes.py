import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import sync_public_notes


class GenerateBookMdFilesTest(unittest.TestCase):
    def test_removes_stale_book_page_after_title_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            notes = root / "notes"
            books = root / "books"
            notes.mkdir()
            books.mkdir()

            old_page = books / "dao-de-jing.md"
            old_page.write_text("stale", encoding="utf-8")
            preserved = books / ".gitkeep"
            preserved.write_text("", encoding="utf-8")
            index = books / "_index.md"
            index.write_text("index", encoding="utf-8")

            metadata = {
                "date": "2026-08-22",
                "extra": {
                    "custom_props": {
                        "title": "Dao De Jing (Vinogrodsky translation)",
                        "author": "Lao Tzu",
                        "genre": "philosophy",
                        "status": "reading",
                        "type": "book",
                    }
                },
            }
            note = notes / "Lao Tzu.Dao De Jing (Vinogrodsky translation).md"
            note.write_text(
                f"---\n{yaml.safe_dump(metadata, sort_keys=False)}---\n",
                encoding="utf-8",
            )

            with (
                patch.object(sync_public_notes, "obsidian_notes_path", str(notes)),
                patch.object(sync_public_notes, "books_path", str(books)),
            ):
                sync_public_notes.generate_book_md_files()

            self.assertFalse(old_page.exists())
            self.assertTrue(
                (books / "dao-de-jing-vinogrodsky-translation.md").exists()
            )
            self.assertTrue(preserved.exists())
            self.assertTrue(index.exists())

    def test_load_metadata_allows_frontmatter_delimiter_in_value(self):
        with tempfile.TemporaryDirectory() as temp:
            note = Path(temp) / "book.md"
            note.write_text(
                "---\n"
                "extra:\n"
                "  custom_props:\n"
                "    cover: /images/covers/book----part.jpg\n"
                "    title: Book\n"
                "---\n"
                "# Book\n",
                encoding="utf-8",
            )

            metadata = sync_public_notes.load_metadata(str(note))

            self.assertEqual(
                metadata["extra"]["custom_props"]["cover"],
                "/images/covers/book----part.jpg",
            )


if __name__ == "__main__":
    unittest.main()
