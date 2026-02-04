local options = {
	ensure_installed = {
		"lua-language-server",
		"stylua",
		"css-lsp",
		"html-lsp",
		"typescript-language-server",
		"deno",
		"prettier",
		"clangd",
		"pyright",
		"ruff",
		"latexindent",
		"rust-analyzer",
		"gopls",
		"jdtls",
		"kotlin-language-server",
		"clang-format",
		"coq-lsp",
		"tex-fmt",
		"shfmt",
		"texlab",
		"mbake",
		"taplo",
	},
	automatic_installation = false,

	PATH = "skip",

	ui = {
		icons = {
			package_pending = " ",
			package_installed = "󰄳 ",
			package_uninstalled = " 󰚌",
		},

		keymaps = {
			toggle_server_expand = "<CR>",
			install_server = "i",
			update_server = "u",
			check_server_version = "c",
			update_all_servers = "U",
			check_outdated_servers = "C",
			uninstall_server = "X",
			cancel_installation = "<C-c>",
		},
	},

	max_concurrent_installers = 10,
}

return options
