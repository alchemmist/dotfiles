local options = {
	pickers = {
		find_files = {
			hidden = true,
			follow = true,
		},
	},
	defaults = {
		vimgrep_arguments = {
			"rg",
			"-L",
			"--follow",
			"--hidden",
			"--color=never",
			"--no-heading",
			"--with-filename",
			"--line-number",
			"--column",
			"--smart-case",
		},

		mappings = {
			n = { ["q"] = require("telescope.actions").close },
			i = {
				["<C-j>"] = require("telescope.actions").move_selection_next,
				["<C-k>"] = require("telescope.actions").move_selection_previous,
				["<C-n>"] = require("telescope.actions").cycle_history_next,
				["<C-p>"] = require("telescope.actions").cycle_history_prev,
			},
		},
		prompt_prefix = "   ",
		selection_caret = "  ",
		entry_prefix = "  ",
		initial_mode = "insert",
		selection_strategy = "reset",
		sorting_strategy = "ascending",
		layout_strategy = "horizontal",
		layout_config = {
			horizontal = {
				prompt_position = "bottom",
				preview_width = 0.55,
			},
			vertical = {
				mirror = false,
			},
			width = 0.87,
			height = 0.80,
			preview_cutoff = 1,
		},
		file_sorter = require("telescope.sorters").get_fuzzy_file,
		file_ignore_patterns = { "node_modules" },
		generic_sorter = require("telescope.sorters").get_generic_fuzzy_sorter,
		path_display = { "truncate" },
		winblend = 0,
		border = {},
		borderchars = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
		color_devicons = true,
		set_env = { ["COLORTERM"] = "truecolor" }, -- default = nil,
		file_previewer = require("telescope.previewers").vim_buffer_cat.new,
		grep_previewer = require("telescope.previewers").vim_buffer_vimgrep.new,
		qflist_previewer = require("telescope.previewers").vim_buffer_qflist.new,
		-- Developer configurations: Not meant for general override
		buffer_previewer_maker = require("telescope.previewers").buffer_previewer_maker,
		history = {
			-- По умолчанию path уже будет указывать в ~/.local/share/nvim/telescope_history.sqlite3
			-- Но можно явно задать:
			path = vim.fn.stdpath("data") .. "/telescope_history.sqlite3",
			-- Сколько «старых» запросов хранить в sqlite (по умолчанию 100):
			limit = 100,
		},

		-- (Опционально) Блок cache_picker, чтобы можно было «возобновить» прошлый picker:
		cache_picker = {
			-- сколько различных пиковеров (по умолчанию 15) хранить в кэше:
			max_pickers = 15,
			-- если поставить true, в :Telescope pickers будут показаны результаты
			-- без учёта названия пика, иначе — фильтрация по текущему picker's name
			-- (необязательно менять):
			picker = nil,
		},
	},

	extensions_list = { "themes", "terms", "fzf" },
	extensions = {
		fzf = {
			fuzzy = true,
			override_generic_sorter = true,
			override_file_sorter = true,
			case_mode = "smart_case",
		},
	},
}

return options
