" Основные настройки
set nocompatible        " Отключаем совместимость с Vi
set number             " Включаем нумерацию строк
set hidden            " Позволяет переключаться между буферами без сохранения
set clipboard=unnamedplus " Копирование в системный буфер обмена (если поддерживается)

" Отступы и табуляция
set expandtab         " Использовать пробелы вместо табов
set shiftwidth=4      " Количество пробелов при сдвиге (>>, <<)
set tabstop=4         " Отображение табов как 4 пробела
set softtabstop=4     " Удобное удаление табов

" Поиск
set ignorecase        " Игнорировать регистр при поиске
set smartcase         " Если есть заглавные буквы в запросе — учитывать регистр
set hlsearch          " Подсвечивать результаты поиска
set incsearch         " Интерактивный поиск при вводе запроса

" Визуальные улучшения
set wrap              " Перенос строк
set showcmd           " Показывать вводимые команды
set wildmenu          " Улучшенное автодополнение команд
set termguicolors     " Поддержка 24-битного цвета (если поддерживается)

" Файлы и бэкапы
set backup           " Включаем создание бэкапов
set undofile         " Включаем неограниченный undo
set swapfile         " Включаем swap-файл
set autoread         " Автоматически перечитывать файл при изменении извне

" Улучшение работы с файлами
set fileencoding=utf-8   " Кодировка по умолчанию
set fileformats=unix,dos " Форматы файлов

" Горячие клавиши
nnoremap <C-s> :w<CR>    " Ctrl+S сохраняет файл
nnoremap <C-q> :q<CR>    " Ctrl+Q закрывает файл
inoremap jj <Esc>        " Быстрый выход из режима вставки

" Автодополнение
set completeopt=menu,menuone,noselect

" Улучшенная навигация
set scrolloff=5         " Минимум 5 строк отступа сверху/снизу при прокрутке
set sidescrolloff=8     " Отступ по бокам при горизонтальной прокрутке

set noswapfile     " Отключает swap-файл
set nobackup       " Отключает резервные копии
set nowritebackup  " Отключает бэкап перед сохранением
set noundofile     " Отключает историю изменений (undo-файл)

colorscheme pablo
syntax off

set clipboard=unnamedplus

set cursorline
hi CursorLine term=bold cterm=bold guibg=Grey40
