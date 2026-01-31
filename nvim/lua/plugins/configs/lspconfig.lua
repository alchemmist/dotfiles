local M = {}

local servers =
	{ "html", "cssls", "ts_ls", "clangd", "pyright", "lua_ls", "rust_analyzer", "eslint", "gopls", "sqlls", "texlab" }

local utils = require("core.utils")

local cmp = require("cmp")

M.on_attach = function(client, bufnr)
	client.server_capabilities.documentFormattingProvider = false
	client.server_capabilities.documentRangeFormattingProvider = false

	utils.load_mappings("lspconfig", { buffer = bufnr })

	client.server_capabilities.semanticTokensProvider = nil
end

M.capabilities = vim.lsp.protocol.make_client_capabilities()
M.capabilities.textDocument.completion.completionItem = {
	documentationFormat = { "markdown", "plaintext" },
	snippetSupport = true,
	preselectSupport = true,
	insertReplaceSupport = true,
	labelDetailsSupport = true,
	deprecatedSupport = true,
	commitCharactersSupport = true,
	tagSupport = { valueSet = { 1 } },
	resolveSupport = {
		properties = {
			"documentation",
			"detail",
			"additionalTextEdits",
		},
	},
}

vim.lsp.config("*", {
	on_attach = M.on_attach,
	capabilities = M.capabilities,
})

vim.diagnostic.config({
	virtual_text = false,
	signs = false,
	update_in_insert = false,
	underline = true,
	severity_sort = true,
	open_loclist = true,
})

cmp.setup({
	snippet = {
		expand = function(args)
			require("luasnip").lsp_expand(args.body)
		end,
	},
	mapping = cmp.mapping.preset.insert({
		["<C-b>"] = cmp.mapping.scroll_docs(-4),
		["<C-f>"] = cmp.mapping.scroll_docs(4),
		["<C-Space>"] = cmp.mapping.complete(),
		["<C-e>"] = cmp.mapping.close(),
		["<CR>"] = cmp.mapping.confirm({ select = true }),
	}),
	sources = cmp.config.sources({
		{ name = "nvim_lsp" },
		{ name = "luasnip" },
	}, {
		{ name = "buffer" },
		{ name = "path" },
	}),
})

vim.lsp.config("lua_ls", {
	settings = {
		Lua = {
			diagnostics = {
				globals = { "vim" },
			},
			workspace = {
				library = {
					[vim.fn.expand("$VIMRUNTIME/lua")] = true,
					[vim.fn.expand("$VIMRUNTIME/lua/vim/lsp")] = true,
					[vim.fn.stdpath("data") .. "/lazy/lazy.nvim/lua/lazy"] = true,
				},
				maxPreload = 100000,
				preloadFileSize = 10000,
			},
		},
	},
})

vim.lsp.config("gopls", {
	on_attach = function(client, bufnr)
		M.on_attach(client, bufnr) -- при необходимости вызовите базовую
		vim.o.splitright = false
		vim.o.splitbelow = false
	end,
})
vim.lsp.config("pyright", {
	settings = {
		python = {
			analysis = {
				typeCheckingMode = "on",
				autoSearchPaths = true,
				useLibraryCodeForTypes = true,
				diagnosticMode = "workspace",
			},
		},
	},
})

vim.lsp.config("texlab", {
	settings = {
		texlab = {
			build = {
				executable = "latexmk",
				args = { "-pdf", "-interaction=nonstopmode", "-synctex=1", "%f" },
				onSave = true,
				forwardSearchAfter = false,
			},
			chktex = {
				onEdit = true,
				onOpenAndSave = true,
			},
			diagnostics = {
				delay = 300,
			},
		},
	},
	filetypes = { "tex", "cls" },
})

for _, server_name in ipairs(servers) do
	vim.lsp.enable(server_name)
end

return M
