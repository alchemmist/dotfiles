import os
import yaml

# Путь к вашей папке с заметками
VAULT_PATH = "/home/alchemmist/knowledge-base"

def parse_metadata(note_path):
    """Извлекает метаданные из заметки, игнорируя ошибки в YAML."""
    with open(note_path, "r", encoding="utf-8") as file:
        content = file.read()
        if content.startswith("---"):
            try:
                _, yaml_section, body = content.split("---", 2)
                metadata = yaml.safe_load(yaml_section)
                return metadata, body
            except yaml.YAMLError as e:
                # print(f"Ошибка обработки YAML в файле {note_path}: {e}")
                return None, None
    return None, None

def save_note(note_path, metadata, body):
    """Сохраняет изменения в заметке."""
    with open(note_path, "w", encoding="utf-8") as file:
        file.write("---\n")
        yaml.dump(metadata, file)
        file.write("---\n")
        file.write(body)

def get_all_notes(vault_path):
    """Возвращает список всех заметок с их метаданными."""
    notes = []
    for root, dirs, files in os.walk(vault_path):
        for file_name in files:
            if file_name.endswith(".md"):
                full_path = os.path.join(root, file_name)
                metadata, body = parse_metadata(full_path)
                if metadata and metadata.get("type") == "note":  # Учитываем только type=note
                    notes.append({"path": full_path, "metadata": metadata, "body": body})
    return notes

def delete_note_by_number(vault_path, target_number):
    """Удаляет заметку с номером target_number и перенумеровывает остальные."""
    notes = get_all_notes(vault_path)
    
    # Ищем заметку с указанным номером
    target_note = next((note for note in notes if note["metadata"].get("number") == target_number), None)
    if not target_note:
        print(f"Заметка с номером {target_number} не найдена.")
        return
    
    # Удаляем файл
    os.remove(target_note["path"])
    print(f"Удалена заметка с номером {target_number}: {target_note['path']}")

    # Перенумеровываем оставшиеся заметки
    for note in notes:
        note_number = note["metadata"].get("number")
        if note_number and note_number > target_number:
            note["metadata"]["number"] -= 1
            save_note(note["path"], note["metadata"], note["body"])
            print(f"Изменен номер заметки: {note['path']} -> {note['metadata']['number']}")

if __name__ == "__main__":
    # Запрашиваем номер заметки для удаления
    number_to_delete = int(input("Введите номер заметки, которую нужно удалить: "))
    delete_note_by_number(VAULT_PATH, number_to_delete)

