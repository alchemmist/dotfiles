require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		python = { "black" },
		javascript = { "prettier_js" },
		typescript = { "prettier_js" },
		javascriptreact = { "prettier_js" },
		typescriptreact = { "prettier_js" },
		json = { "prettier_html" },
		yaml = { "yamlfmt" },
		yml = { "yamlfmt" },
		html = { "prettier_html" },
		css = { "prettier_html" },
		scss = { "prettier_html" },
		sh = { "shfmt" },
		rust = { "rustfmt" },
		go = { "gofmt" },
		markdown = { "prettier_html" },
		toml = { "taplo" },
		tex = { "tex-fmt" },
		java = { "clang-format" },
	},

	formatters = {
		["clang-format"] = {
			prepend_args = {
				"--style",
				"{BasedOnStyle: Google, IndentWidth: 4}",
			},
		},
		["prettier_js"] = {
			command = "prettier",
			args = {
				"--stdin-filepath",
				"$FILENAME",
				"--tab-width",
				"2",
				"--use-tabs",
				"false",
			},
		},
		["prettier_jsx"] = {
			command = "prettier",
			args = {
				"--stdin-filepath",
				"$FILENAME",
				"--tab-width",
				"2",
				"--use-tabs",
				"false",
			},
		},
		["prettier_html"] = {
			command = "prettier",
			args = {
				"--stdin-filepath",
				"$FILENAME",
				"--tab-width",
				"2",
				"--use-tabs",
				"false",
			},
		},
		["prettier_css"] = {
			command = "prettier",
			args = {
				"--stdin-filepath",
				"$FILENAME",
				"--tab-width",
				"2",
				"--use-tabs",
				"false",
			},
		},
	},
})
