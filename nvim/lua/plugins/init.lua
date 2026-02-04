local map = require("core.mappings")

local plugins = {
	"nvim-lua/plenary.nvim",
	{
		"nvim-treesitter/nvim-treesitter",
		lazy = true,
		build = ":TSUpdate",
		config = function(_, opts)
			require("plugins.configs.treesitter")
		end,
	},

	{
		"lukas-reineke/indent-blankline.nvim",
		main = "ibl",
		lazy = true,
		keys = {
			{
				"<leader>i",
				map.ibl["<leader>i"],
				desc = "Toggle indent blankline",
			},
		},
		opts = {
			indent = { char = "▏" },
			enabled = false,
			scope = {
				enabled = false,
				show_start = false,
				show_end = false,
				highlight = nil,
			},
		},
	},
	{
		"williamboman/mason.nvim",
		lazy = true,
		cmd = { "Mason", "MasonInstall", "MasonInstallAll", "MasonUpdate" },
		opts = function()
			return require("plugins.configs.mason")
		end,
		config = function(_, opts)
			require("mason").setup(opts)

			vim.api.nvim_create_user_command("MasonInstallAll", function()
				vim.cmd("MasonInstall " .. table.concat(opts.ensure_installed, " "))
			end, {})

			vim.g.mason_binaries_list = opts.ensure_installed
		end,
	},
	{
		"L3MON4D3/LuaSnip",
		lazy = true,
		event = "InsertEnter",
		dependencies = { "rafamadriz/friendly-snippets" },
		config = function()
			require("luasnip.loaders.from_vscode").lazy_load()
			require("luasnip").config.set_config({
				history = true,
				updateevents = "TextChanged,TextChangedI",
			})
		end,
	},
	{
		"saghen/blink.cmp",
		lazy = true,
		version = "1.*",
		event = "InsertEnter",
		dependencies = {
			"rafamadriz/friendly-snippets",
			"L3MON4D3/LuaSnip",
		},
		opts = {
			keymap = {
				preset = "none",

				["<C-Space>"] = { "show", "show_documentation", "hide_documentation" },
				["<CR>"] = { "accept", "fallback" },

				["<C-j>"] = { "select_next", "fallback" },
				["<C-k>"] = { "select_prev", "fallback" },
				["<C-e>"] = { "hide", "fallback" },
			},
			cmdline = {
				enabled = true,
				completion = {
					menu = { auto_show = false },
					ghost_text = { enabled = false },
				},
				keymap = {
					["<Tab>"] = { "show", "accept" },
					["<Esc>"] = { "cancel" },
					["<C-j>"] = { "show_and_insert_or_accept_single", "select_next" },
					["<C-k>"] = { "show_and_insert_or_accept_single", "select_prev" },
					["<CR>"] = { "accept", "fallback" },
				},
			},
			completion = {
				documentation = { auto_show = true, window = {
					border = "rounded",
				} },
				trigger = {
					show_on_insert = false,
					show_on_keyword = false,
				},
				menu = {
					border = "rounded",
					winblend = 0,
					scrollbar = false,
				},
			},

			appearance = {
				nerd_font_variant = "mono",
				use_nvim_cmp_as_default = false,
			},

			sources = {
				default = { "lsp", "path", "snippets", "buffer" },
			},

			fuzzy = { implementation = "prefer_rust_with_warning" },
		},
	},
	{
		"numToStr/Comment.nvim",
		lazy = true,
		keys = {
			{ "gcc", mode = "n", desc = "Comment toggle current line" },
			{ "gc", mode = { "n", "o" }, desc = "Comment toggle linewise" },
			{ "gc", mode = "x", desc = "Comment toggle linewise (visual)" },
			{ "gbc", mode = "n", desc = "Comment toggle current block" },
			{ "gb", mode = { "n", "o" }, desc = "Comment toggle blockwise" },
			{ "gb", mode = "x", desc = "Comment toggle blockwise (visual)" },
		},
		init = function() end,
		config = function(_, opts)
			require("plugins.configs.others").comment(opts)
		end,
	},
	{
		"windwp/nvim-autopairs",
		lazy = true,
		event = "InsertEnter",
		opts = {},
	},
	{
		"nvim-telescope/telescope.nvim",
		lazy = true,
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
			{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
		},
		cmd = "Telescope",
		init = function() end,
		opts = function()
			return require("plugins.configs.telescope")
		end,
		config = function(_, opts)
			local telescope = require("telescope")
			telescope.setup(opts)

			for _, ext in ipairs(opts.extensions_list) do
				telescope.load_extension(ext)
			end
		end,
	},
	{
		"akinsho/git-conflict.nvim",
		lazy = true,
		version = "*",
		config = function()
			require("git-conflict").setup({
				default_mappings = true,
				default_commands = true,
				disable_diagnostics = false,
				list_opener = "copen",
				highlights = {
					incoming = "DiffAdd",
					current = "DiffText",
				},
			})
		end,
	},
	{
		"neovim/nvim-lspconfig",
		lazy = true,
		config = function()
			require("plugins.configs.lspconfig")
		end,
	},
	{
		"stevearc/oil.nvim",
		lazy = false,
		opts = {
			buf_options = {
				buflisted = false,
				bufhidden = "hide",
			},
			keymaps = {
				["g?"] = "actions.show_help",
				["<CR>"] = "actions.select",
				["<C-s>"] = { "actions.select", opts = { vertical = true } },
				["<C-h>"] = { "actions.select", opts = { horizontal = true } },
				["<C-t>"] = { "actions.select", opts = { tab = true } },
				["<C-p>"] = "actions.preview",
				["<Esc>"] = "actions.close",
				["<C-r>"] = "actions.refresh",
				["-"] = { "actions.parent", mode = "n" },
				["_"] = { "actions.open_cwd", mode = "n" },
				[">"] = { "actions.cd", mode = "n" },
				["g~"] = { "actions.cd", opts = { scope = "tab" }, mode = "n" },
				["gs"] = { "actions.change_sort", mode = "n" },
				["gx"] = "actions.open_external",
				["g."] = { "actions.toggle_hidden", mode = "n" },
				["g\\"] = { "actions.toggle_trash", mode = "n" },
			},
			view_options = {
				show_hidden = true,
				natural_order = "fast",
				case_insensitive = false,
				sort = { { "type", "asc" }, { "name", "asc" } },
			},
			delete_to_trash = false,
			skip_confirm_for_simple_edits = false,
			prompt_save_on_select_new_entry = true,
		},
	},
	{
		"iamcco/markdown-preview.nvim",
		lazy = true,
		cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
		build = "cd app && npm install",
		init = function()
			vim.g.mkdp_filetypes = { "markdown" }
		end,
		ft = { "markdown" },
		config = function()
			vim.g.mkdp_browserfunc = "OpenMarkdownPreview"
			vim.cmd([[
                function OpenMarkdownPreview(url)
                  execute "silent ! google-chrome-stable --new-window --app=" . a:url
                endfunction
              ]])
		end,
	},
	{
		"lervag/vimtex",
		lazy = true,
		config = function()
			require("plugins.configs.others").vimtex()
		end,
		ft = { "tex", "cls" },
	},
	{

		"williamboman/mason-lspconfig.nvim",
		lazy = true,
		dependencies = {
			"williamboman/mason.nvim",
			"neovim/nvim-lspconfig",
		},
		config = function() end,
	},
	{
		"whonore/Coqtail",
		lazy = true,
		ft = "coq",
		config = function()
			vim.cmd([[
            let g:coqtail_enable = 1
        ]])
		end,
	},
	-- {
	-- 	"mfussenegger/nvim-jdtls",
	-- 	lazy = true,
	-- 	ft = {
	-- 		"java",
	-- 	},
	-- 	config = function()
	-- 		require("plugins.configs.java")
	-- 	end,
	-- },
	{
		"stevearc/conform.nvim",
		lazy = true,
		event = "VeryLazy",
		config = function()
			require("plugins.configs.conform")
		end,
	},

	{
		"kevinhwang91/nvim-ufo",
		lazy = true,
		dependencies = { "kevinhwang91/promise-async", "nvim-treesitter/nvim-treesitter" },
		keys = {
			{ "zR", map.ufo.zR, desc = "Open all folds" },
			{ "zM", map.ufo.zM, desc = "Close all folds" },
			{ "<leader>h", map.ufo["<leader>h"], desc = "Toggle fold under cursor" },
		},

		config = function()
			require("plugins.configs.others").ufo()
		end,
	},
	{
		"moss-theme/moss.nvim",
		lazy = false,
		version = "*",
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		config = function()
			vim.cmd("colorscheme moss")
		end,
	},
	{
		"norcalli/nvim-colorizer.lua",
		lazy = true,
		keys = {
			{ "<leader>c", map.colorizer["<leader>c"], desc = "Toggle Colorizer" },
		},
	},
	{
		"folke/flash.nvim",
		lazy = true,
		event = "VeryLazy",
		keys = {
			{
				"s",
				mode = { "n", "x", "o" },
				function()
					require("flash").jump()
				end,
				desc = "Flash",
			},
		},
	},
}

require("lazy").setup(plugins)
