import os
import shutil
import yaml
import datetime
import re
import urllib.request
from dateutil import tz  # Для работы с часовыми поясами

# Установите нужный часовой пояс (например, Europe/Moscow)
TIMEZONE = tz.gettz("Europe/Moscow")

# Пути к базе знаний и директориям блога.
# expanduser обязателен: Python (в отличие от шелла) сам "~" не разворачивает,
# иначе os.walk/open работают с буквальной папкой "~" и молча ничего не делают.
obsidian_notes_path = os.path.expanduser("~/knowledge-base")
obsidian_images_path = os.path.join(obsidian_notes_path, "images")
covers_dir = os.path.join(obsidian_images_path, "covers")


content_path = os.path.expanduser("~/code/blog/site/content")
books_path = os.path.join(content_path, "books")
articles_path = os.path.join(content_path, "articles")
moss_path = os.path.join(content_path, "moss")
teach_path = os.path.join(content_path, "teach")
essay_path = os.path.join(content_path, "essays")
poetry_path = os.path.join(content_path, "poetry")
static_images_path = os.path.expanduser("~/code/blog/site/static/images")


def slugify(value):
    return re.sub(r"[^\w\-]+", "-", str(value).lower()).strip("-")


def is_book(props) -> bool:
    if not isinstance(props, dict):
        return False
    type_value = props.get("type")
    if isinstance(type_value, list):
        return "book" in type_value
    return type_value == "book"


def sniff_ext(data: bytes) -> str | None:
    """Определяет расширение по магическим байтам. Расширение из URL не годится:
    litres/ozon отдают webp под .jpg-адресом, а Hugo выбирает декодер по
    расширению и падает. None — если это вообще не картинка."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:4] == b"GIF8":
        return ".gif"
    return None


def download_cover(url: str, slug: str) -> str:
    """Скачивает обложку в knowledge-base/images/covers и возвращает локальный
    путь вида /images/covers/<slug>.<ext> для поля cover."""
    os.makedirs(covers_dir, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read()

    ext = sniff_ext(data)
    if ext is None:
        raise ValueError("ответ не является поддерживаемой картинкой")

    dest = os.path.join(covers_dir, f"{slug}{ext}")
    with open(dest, "wb") as f:
        f.write(data)

    return f"/images/covers/{slug}{ext}"


def localize_book_covers():
    """Находит книги с обложкой-URL, скачивает картинку в KB и заменяет URL на
    локальный путь прямо в исходной заметке (и там, и в блоге — через генерацию)."""
    count = 0
    for root, dirs, files in os.walk(obsidian_notes_path):
        for file in files:
            if not file.endswith(".md"):
                continue

            file_path = os.path.join(root, file)
            if "Templates" in file_path:
                continue

            metadata = load_metadata(file_path)
            if not metadata:
                continue

            extra = metadata.get("extra")
            props = extra.get("custom_props", {}) if isinstance(extra, dict) else {}
            if not is_book(props):
                continue

            cover = props.get("cover")
            if not isinstance(cover, str) or not cover.startswith(("http://", "https://")):
                continue

            title = props.get("title") or "Без названия"
            slug = slugify(title)
            try:
                local = download_cover(cover, slug)
            except Exception as e:
                print(f"⚠️ Не удалось скачать обложку для «{title}»: {e}")
                continue

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            new_content = content.replace(cover, local)
            if new_content != content:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(new_content)

            print(f"🖼  Обложка «{title}» → {local}")
            count += 1

    print(f"🖼  Локализовано обложек: {count}")


def generate_book_md_files():
    count = 0
    os.makedirs(books_path, exist_ok=True)

    for root, dirs, files in os.walk(obsidian_notes_path):
        for file in files:
            if not file.endswith(".md"):
                continue

            file_path = os.path.join(root, file)
            if "Templates" in file_path:
                continue

            metadata = load_metadata(file_path)
            if not metadata:
                continue

            props = metadata.get("extra", {}).get("custom_props", {})
            if "type" not in props:
                continue

            type_value = props["type"]
            if isinstance(type_value, list) and "book" not in type_value:
                continue
            if isinstance(type_value, str) and type_value != "book":
                continue

            title = props.get("title") or "Без названия"
            filename = f"{slugify(title)}.md"
            filepath = os.path.join(books_path, filename)

            frontmatter = {
                # "build": {"list": True, "render": False},
                "title": title,
                "author": props.get("author"),
                "genre": (
                    [props.get("genre")]
                    if isinstance(props.get("genre"), str)
                    else props.get("genre")
                ),
                "status": props.get("status"),
                "cover": props.get("cover"),
                "date": metadata.get("date"),
            }

            with open(filepath, "w", encoding="utf-8") as f:
                f.write("---\n")
                yaml.dump(frontmatter, f, allow_unicode=True, sort_keys=False)
                f.write("---\n\n")

            count += 1

    print(f"📚 Сгенерировано {count} книг в виде Markdown-файлов в {books_path}")


def load_metadata(file_path: str) -> dict | None:
    """Извлекает YAML-метаинформацию из markdown-файла"""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        if content.startswith("---"):
            try:
                yaml_part = content.split("---")[1]
                return yaml.safe_load(yaml_part)
            except yaml.YAMLError:
                return None
    return None


def update_date_metadata(content: str, new_date: datetime.datetime) -> str:
    """Обновляет дату в front matter и сохраняет остальной текст без изменений"""
    parts = content.split("---")
    if len(parts) < 3:
        return content

    # YAML-блок
    yaml_raw = parts[1]
    body = "---".join(parts[2:])  # сохраняем тело без join(''), чтобы не терять \n

    try:
        metadata = yaml.safe_load(yaml_raw) or {}
    except yaml.YAMLError:
        return content

    # Обновляем дату
    metadata["date"] = new_date.isoformat()

    # Удаляем поле времени
    if "extra" in metadata and "custom_props" in metadata["extra"]:
        custom_props = metadata["extra"]["custom_props"]
        custom_props.pop("time", None)

        if not custom_props:
            del metadata["extra"]

    # Формируем новый YAML
    new_yaml = yaml.dump(metadata, allow_unicode=True, sort_keys=False).strip()

    # Важно: вернуть именно с двойным переносом перед контентом
    return f"---\n{new_yaml}\n---\n\n{body.lstrip()}"


def process_note(file_path: str) -> str:
    """Обрабатывает заметку: объединяет дату и время + обрабатывает inline-код"""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    metadata = load_metadata(file_path)
    if not metadata:
        return content

    # Получаем дату и время
    date_value = metadata.get("date")
    time_value = "00:00"

    if "extra" in metadata and "custom_props" in metadata["extra"]:
        custom_props = metadata["extra"]["custom_props"]
        time_value = custom_props.get("time", "00:00")

    # Парсим дату и время
    try:
        date_only = datetime.datetime.strptime(str(date_value), "%Y-%m-%d").date()
        time_only = datetime.datetime.strptime(time_value, "%H:%M").time()

        # Собираем полную дату с часовым поясом
        full_date = datetime.datetime.combine(date_only, time_only, tzinfo=TIMEZONE)

        # Обновляем контент
        processed_content = update_date_metadata(content, full_date)

        # Обрабатываем inline-блоки кода
        return processed_content

    except (ValueError, TypeError):
        if isinstance(time_value, int):
            print(file_path)
        return content


def get_metadata_fields(file_path: str) -> tuple[str | None, str | None, bool]:
    """Получает tech_name и type из метаданных"""
    metadata = load_metadata(file_path)
    tech_name = metadata.get("tech_name") if metadata else None
    type_ = None
    is_public = False

    if metadata and "extra" in metadata:
        custom_props = metadata["extra"].get("custom_props", {})
        if isinstance(custom_props, dict):
            is_public = custom_props.get("public", False)
            type_ = custom_props.get("type")

    return tech_name, type_, is_public


def copy_notes_to_blog():
    for root, dirs, files in os.walk(obsidian_notes_path):
        for file in files:
            if file.endswith(".md"):
                file_path = os.path.join(root, file)
                tech_name, type_, is_public = get_metadata_fields(file_path)

                if not is_public or not tech_name:
                    continue

                metadata = load_metadata(file_path)
                lang = metadata.get("language", "")

                # Выбор директории назначения
                if type_ == "poetry":
                    target_path = poetry_path
                elif type_ == "moss":
                    target_path = moss_path
                elif type_ == "teach":
                    target_path = teach_path
                elif type_ == "synopsis":
                    target_path = articles_path
                elif type_ == "essay":
                    target_path = essay_path
                else:
                    target_path = content_path

                # Формируем имя файла с .ru если язык русский
                if lang:
                    new_filename = f"{tech_name}.{lang}.md"
                else:
                    new_filename = f"{tech_name}.md"

                blog_file_path = os.path.join(target_path, new_filename)
                os.makedirs(target_path, exist_ok=True)

                # Обрабатываем и сохраняем контент
                processed_content = process_note(file_path)

                with open(blog_file_path, "w", encoding="utf-8") as f:
                    f.write(processed_content)

                print(f"    {new_filename} обработан и сохранен в {target_path}.")


def copy_images():
    if not os.path.exists(obsidian_images_path):
        print("⚠️ Папка с изображениями не найдена.")
        return

    for root, dirs, files in os.walk(obsidian_images_path):
        for file in files:
            if file.lower().endswith(
                (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4")
            ):
                src_path = os.path.join(root, file)
                rel_path = os.path.relpath(src_path, obsidian_images_path)
                dest_path = os.path.join(static_images_path, rel_path)

                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.copy2(src_path, dest_path)
                print(f"📷 Копировано изображение: {rel_path}")


if __name__ == "__main__":
    localize_book_covers()
    copy_notes_to_blog()
    copy_images()
    generate_book_md_files()
