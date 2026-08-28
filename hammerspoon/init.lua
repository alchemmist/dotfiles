local function toggleLayout()
    local current = hs.keycodes.currentLayout()

    if current == "ABC" then
        hs.keycodes.setLayout("Russian - PC")
    else
        hs.keycodes.setLayout("ABC")
    end
end

do
    local leftShiftPressed = false
    local rightShiftPressed = false

    hs.eventtap.new({hs.eventtap.event.types.flagsChanged}, function(event)
        local flags = event:getFlags()

        local left = flags.shift and not flags.rightShift
        local right = flags.rightShift

        if left and not leftShiftPressed and rightShiftPressed then
            toggleLayout()
        elseif right and not rightShiftPressed and leftShiftPressed then
            toggleLayout()
        end

        leftShiftPressed = left
        rightShiftPressed = right

        return false
    end):start()
end

hs.hotkey.bind({"cmd"}, "delete", function()
    hs.eventtap.keyStroke({"alt"}, "delete", 0)
end)

-- Keep Alacritty, tmux, Neovim and terminal TUIs (including Codex) on one
-- palette.  Alacritty live-reloads the import; tmux and running nvim sessions
-- are updated by the script.  New nvim instances read the shared state file.
local function toggleTerminalTheme()
    local script = os.getenv("HOME") .. "/scripts/alacritty-theme-toggle.sh"
    hs.task.new("/bin/zsh", function(exitCode, stdOut, stdErr)
        if exitCode == 0 then
            local theme = (stdOut or ""):gsub("%s+$", "")
            hs.notify.new(nil, {
                title = "Terminal theme",
                informativeText = theme == "light" and "Light" or "Dark",
                withdrawAfter = 1.5,
            }):send()
        else
            hs.notify.new(nil, {
                title = "Terminal theme",
                informativeText = (stdErr or "switch failed"):gsub("%s+$", ""),
                withdrawAfter = 3,
            }):send()
        end
    end, {"-lc", script .. " toggle"}):start()
end

-- Consume Cmd+U at the event level so terminal applications (especially
-- Codex) never receive it as their own editing command.
hs.themeToggleTap = hs.eventtap.new({hs.eventtap.event.types.keyDown}, function(event)
    local flags = event:getFlags()
    local key = hs.keycodes.map[event:getKeyCode()]
    if key == "u" and flags.cmd and not flags.ctrl and not flags.alt and not flags.shift then
        toggleTerminalTheme()
        return true
    end
    return false
end):start()

hs.hotkey.bind({"ctrl", "cmd"}, "f", function()
    local win = hs.window.focusedWindow()

    if not win then
        return
    end

    win:setFrame(win:screen():frame())
end)

-- macoslike-screenshot по Cmd+Shift+3 (системный хоткей надо отключить в
-- System Settings → Keyboard → Keyboard Shortcuts → Screenshots).
hs.hotkey.bind({"cmd", "shift"}, "3", function()
    hs.task.new("/bin/zsh", nil, {"-lc", os.getenv("HOME") .. "/scripts/macoslike-screenshot.sh --no-delay"}):start()
    -- ВАЖНО: Hammerspoon должен иметь разрешение Screen Recording
    -- (System Settings → Privacy & Security → Screen Recording),
    -- иначе flameshot захватит только обои без окон.
end)

-- Авто-перезагрузка конфига при изменении init.lua
hs.configWatcher = hs.pathwatcher.new(os.getenv("HOME") .. "/.hammerspoon/", function(files)
    for _, file in pairs(files) do
        if file:sub(-4) == ".lua" then hs.reload(); return end
    end
end):start()

-- CLI hs — чтобы вызывать Hammerspoon из шелла (hs -c ...)
pcall(function() hs.ipc.cliInstall("/opt/homebrew") end)

-- === Claude Code notifications (added by Stefania) ===
-- Глобальная функция, вызывается из ~/.claude/hooks/notify.sh через `hs -c`.
-- Аргументы передаются в base64 — кавычки/пробелы/& в тексте не ломают ни shell, ни lua.
-- Клик по баннеру переключает tmux на панель с ожидающим Claude и поднимает Alacritty.
function claudeNotify(b64msg, b64sub, b64pane, b64sound)
    local function dec(s)
        local ok, r = pcall(hs.base64.decode, s or "")
        return (ok and r) or ""
    end
    local msg = dec(b64msg); if msg == "" then msg = "Нужно твоё внимание" end
    local subtitle = dec(b64sub)
    local pane = dec(b64pane)
    local sound = dec(b64sound); if sound == "" then sound = "Ping" end

    local n = hs.notify.new(function(notification)
        if pane ~= "" then
            local tmux = "/opt/homebrew/bin/tmux"
            local q = "'" .. pane:gsub("'", "") .. "'"
            local session = hs.execute(tmux .. " display-message -p -t " .. q .. " '#S' 2>/dev/null")
            session = (session or ""):gsub("%s+$", "")
            if session ~= "" then
                local s = "'" .. session:gsub("'", "") .. "'"
                hs.execute(tmux .. " switch-client -t " .. s ..
                    "; " .. tmux .. " select-window -t " .. q ..
                    "; " .. tmux .. " select-pane -t " .. q .. " 2>/dev/null")
            end
        end
        hs.application.launchOrFocusByBundleID("org.alacritty")
    end, {
        title = "Claude Code",
        subTitle = subtitle,
        informativeText = msg,
        soundName = sound,
        withdrawAfter = 0,
    })
    n:send()
end

-- Бонус: тот же обработчик доступен и через hammerspoon:// URL.
hs.urlevent.bind("claudeNotify", function(eventName, params)
    params = params or {}
    local function e(s) return hs.base64.encode(s or "") end
    claudeNotify(e(params.message), e(params.subtitle), e(params.pane), e(params.sound))
end)

hs.startupLayout = require("startup-layout")
hs.startupLayout.start()
function startupWorkspace()
    hs.startupLayout.run()
end
