local M = {}

M.options = {
	nvchad_branch = "v2.0",
}

M.ui = {
	transparency = true,
	lsp_semantic_tokens = true,

	cmp = {
		icons = true,
		lspkind_text = true,
		style = "default",
		border_color = "grey_fg",
		selected_item_bg = "simple",
	},

	statusline = {
		theme = "default",
		separator_style = "default",
		overriden_modules = nil,
	},

	tabufline = {
		enabled = true,
		lazyload = true,
		show_numbers = false,
		overriden_modules = function(modules)
			table.remove(modules, 4)
		end,
	},

	nvdash = {
		load_on_startup = true,
		header = {
			"    •   ",
			"┏┓┓┏┓┏┳┓",
			"┛┗┗┛┗┛┗┗",
			"        ",
		},
		buttons = {
			{ "   Find File", " ", " Telescope find_files " },
			-- { "󰈚  Recent Files", "Spc f o", "Telescope oldfiles" },
			-- { "󰈭     Find Word", "Spc f w", "Telescope live_grep" },
			-- { "  Bookmarks", "Spc m a", "Telescope marks" },
			-- { "        Themes", "Spc t h", "Telescope themes" },
			-- { "  Mappings", "Spc c h", "NvCheatsheet" },
		},
	},

	lsp = {
		signature = {
			disabled = true,
			silent = true,
		},
	},
}

M.lazy_nvim = require("plugins.configs.lazy_nvim")

M.mappings = require("core.mappings")

return M
