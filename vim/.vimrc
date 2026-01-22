set nocompatible        " Отключаем совместимость с Vi
set number             " Включаем нумерацию строк
set hidden            " Позволяет переключаться между буферами без сохранения
set clipboard=unnamedplus

set expandtab         " Использовать пробелы вместо табов
set shiftwidth=4      " Количество пробелов при сдвиге (>>, <<)
set tabstop=4         " Отображение табов как 4 пробела
set softtabstop=4     " Удобное удаление табов

set ignorecase        " Игнорировать регистр при поиске
set smartcase         " Если есть заглавные буквы в запросе — учитывать регистр
set hlsearch          " Подсвечивать результаты поиска
set incsearch         " Интерактивный поиск при вводе запроса

set wrap              " Перенос строк
set showcmd           " Показывать вводимые команды
set wildmenu          " Улучшенное автодополнение команд
set termguicolors     " Поддержка 24-битного цвета (если поддерживается)

" Улучшенная навигация
set scrolloff=5         " Минимум 5 строк отступа сверху/снизу при прокрутке
set sidescrolloff=8     " Отступ по бокам при горизонтальной прокрутке

set fileencoding=utf-8   " Кодировка по умолчанию
set fileformats=unix,dos " Форматы файлов
set noswapfile           " Отключает swap-файл
set nobackup             " Отключает резервные копии
set nowritebackup        " Отключает бэкап перед сохранением
set noundofile           " Отключает историю изменений (undo-файл)
set autoread             " Автоматически перечитывать файл при изменении извне

colorscheme pablo
syntax off

set cursorline
hi CursorLine term=bold cterm=bold guibg=Grey15
hi CursorLineNr guifg=#6aa84f
hi EndOfBuffer guifg=Grey30 ctermfg=Grey
hi MatchParen guibg=Grey40 ctermbg=Grey 


set autoindent
set smartindent

function! CopyYankToSystemClipboard(type)
  if a:type ==# 'v'
    normal! gv"xy
    call system('wl-copy', @x)
  else
    normal! "xy
    call system('wl-copy', @x)
  endif
endfunction

nnoremap yy :call CopyYankToSystemClipboard('line')<CR>

xnoremap y :<C-u>call CopyYankToSystemClipboard('v')<CR>

inoremap <Esc><BS> <C-W>

nnoremap <Esc> :nohlsearch<CR>

set noshowcmd
set wildmenu
set wildmode=longest:full,full
