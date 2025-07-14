dofile(vim.g.base46_cache .. "lsp")
require("nvchad.lsp")

local M = {}

local servers = { "html", "cssls", "ts_ls", "clangd", "pyright", "lua_ls", "rust_analyzer", "eslint", "gopls", "sqlls" }

local utils = require("core.utils")

local cmp = require("cmp")
local lspconfig = require("lspconfig")
local mason_status, mason = pcall(require, "mason-registry")

M.on_attach = function(client, bufnr)
	client.server_capabilities.documentFormattingProvider = false
	client.server_capabilities.documentRangeFormattingProvider = false

	utils.load_mappings("lspconfig", { buffer = bufnr })

	if not utils.load_config().ui.lsp_semantic_tokens and client.supports_method("textDocument/semanticTokens") then
		client.server_capabilities.semanticTokensProvider = nil
	end
end

M.capabilities = vim.lsp.protocol.make_client_capabilities()

vim.lsp.handlers["textDocument/signatureHelp"] = function() end

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

vim.diagnostic.config({
	virtual_text = false, -- Отключаем текст ошибок
	signs = false, -- Оставляем иконки (красный крестик)
	update_in_insert = false,
	underline = true,
	severity_sort = true,
	open_loclist = true,
})

for _, lsp in ipairs(servers) do
	lspconfig[lsp].setup({
		on_attach = M.on_attach,
		capabilities = M.capabilities,
		format = {
			indentSize = 4,
			tabSize = 4,
		},
		settings = {
			-- Для Python (pyright)
			python = {
				analysis = {
					typeCheckingMode = "off",
					autoSearchPaths = true,
					useLibraryCodeForTypes = true,
					diagnosticMode = "workspace",
					-- Отключаем сигнатуры
					disableSignatureHelp = true, -- если поддерживается сервером
				},
			},
		},
	})
end

lspconfig.lua_ls.setup({
	on_attach = M.on_attach,
	capabilities = M.capabilities,

	settings = {
		Lua = {
			diagnostics = {
				globals = { "vim" },
			},
			workspace = {
				library = {
					[vim.fn.expand("$VIMRUNTIME/lua")] = true,
					[vim.fn.expand("$VIMRUNTIME/lua/vim/lsp")] = true,
					[vim.fn.stdpath("data") .. "/lazy/ui/nvchad_types"] = true,
					[vim.fn.stdpath("data") .. "/lazy/lazy.nvim/lua/lazy"] = true,
				},
				maxPreload = 100000,
				preloadFileSize = 10000,
			},
		},
	},
})

-- Настройка автодополнения с nvim-cmp
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
		{ name = "luasnip" }, -- Сниппеты (если используются)
	}, {
		{ name = "buffer" },
		{ name = "path" },
	}),
})

lspconfig.gopls.setup({
	on_attach = function(client, bufnr)
		vim.diagnostic.config({
			virtual_text = false, -- Отключаем виртуальный текст с ошибками
			signs = true, -- Отключаем знаки (крестик)
			underline = true, -- Включаем подчеркивание
			update_in_insert = false,
			severity_sort = true, -- Сортировка по важности
		})
		vim.o.splitright = false
		vim.o.splitbelow = false
	end,
})

require("lspconfig").coq_lsp.setup({})

return M
