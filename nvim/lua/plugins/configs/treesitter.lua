require("nvim-treesitter.install").prefer_git = true

require("nvim-treesitter").setup({
	ensure_installed = {
		"lua",
		"vim",
		"bash",
		"python",
		"go",
		"rust",
		"javascript",
		"typescript",
		"json",
		"yaml",
		"toml",
		"markdown",
		"markdown_inline",
		"latex",
		"c",
		"cpp",
		"html",
		"css",
		"java",
	},
	sync_install = false,
	auto_install = true,
	highlight = {
		enable = true,
		additional_vim_regex_highlighting = false,
	},
	indent = {
		enable = true,
	},
	playground = {
		enable = true,
		disable = {},
		updatetime = 25,
		persist_queries = false,
	},
})
