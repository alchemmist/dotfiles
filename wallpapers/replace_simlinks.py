import os
import shutil

def replace_symlinks_with_files(root_dir):
    # Проходим по всем файлам в директории и ее поддиректориях
    for dirpath, dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            
            # Проверяем, является ли файл символической ссылкой
            if os.path.islink(filepath):
                # Получаем реальный путь к файлу, на который ссылается ссылка
                target_path = os.path.realpath(filepath)
                
                # Проверяем, существует ли файл, на который указывает ссылка
                if os.path.exists(target_path):
                    # Проверяем, не совпадает ли файл с символической ссылкой (чтобы избежать ошибки копирования самого себя)
                    if target_path != filepath:
                        print(f"Заменяю символическую ссылку: {filepath}")
                        # Удаляем символическую ссылку
                        os.remove(filepath)
                        # Копируем оригинальный файл на место символической ссылки
                        shutil.copy2(target_path, filepath)
                    else:
                        print(f"Символическая ссылка {filepath} уже указывает на сам файл. Пропускаем.")
                else:
                    print(f"Файл, на который ссылается ссылка, не существует: {target_path}")
            else:
                print(f"{filepath} не является символической ссылкой.")

if __name__ == "__main__":
    # Указываем директорию, в которой будет происходить обработка
    directory_to_process = '.'  # Измените на вашу директорию
    replace_symlinks_with_files(directory_to_process)

