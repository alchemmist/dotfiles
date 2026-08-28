local M = {}

local spaces = require("hs.spaces")

local targets = {
    ["org.alacritty"] = {desktop = 2, frame = "max"},
    ["com.google.Chrome"] = {desktop = 3, frame = "max"},
    ["ru.yandex.yamb"] = {desktop = 4, frame = "left"},
    ["ru.keepcoder.Telegram"] = {desktop = 4, frame = "right"},
    ["md.obsidian"] = {desktop = 5, frame = "max"},
}

local function desktopSpace(index)
    local screen = hs.screen.primaryScreen()
    local screenSpaces = spaces.allSpaces()[screen:getUUID()]
    return screenSpaces and screenSpaces[index]
end

local function frameFor(screen, layout)
    local frame = screen:frame()
    if layout == "left" then
        frame.w = math.floor(frame.w / 2)
    elseif layout == "right" then
        local half = math.floor(frame.w / 2)
        frame.x = frame.x + half
        frame.w = frame.w - half
    end
    return frame
end

local function placeApplication(bundleID)
    local target = targets[bundleID]
    local app = hs.application.get(bundleID)
    local space = target and desktopSpace(target.desktop)
    if not target or not app or not space then
        return
    end

    for _, window in ipairs(app:allWindows()) do
        if window:isStandard() then
            if window:isFullScreen() then
                window:setFullScreen(false)
            end
            window:setFrame(frameFor(hs.screen.primaryScreen(), target.frame), 0)
            spaces.moveWindowToSpace(window, space)
        end
    end
end

local function hideHandyWindow()
    local app = hs.application.get("com.pais.handy")
    if not app then
        return
    end
    for _, window in ipairs(app:allWindows()) do
        window:close()
    end
    app:hide()
end

local function launchAlacritty()
    local app = hs.application.get("org.alacritty")
    if app and #app:allWindows() > 0 then
        placeApplication("org.alacritty")
        return
    end

    local command = "/Users/antonmoss/go/bin/lazy-tmux wakeup -session tmp >/dev/null 2>&1 || true; exec /opt/homebrew/bin/tmux new-session -A -s tmp"
    hs.task.new("/usr/bin/open", nil, {
        "-na",
        "/Applications/Alacritty.app",
        "--args",
        "-e",
        "/bin/zsh",
        "-lc",
        command,
    }):start()
end

local function openApplication(bundleID, applicationPath)
    local app = hs.application.get(bundleID)
    if app and #app:allWindows() > 0 then
        app:activate(true)
        return
    end
    hs.task.new("/usr/bin/open", nil, {"-a", applicationPath}):start()
end

local function reopenWindow(bundleID, prefix)
    local app = hs.application.get(bundleID)
    if not app or #app:allWindows() > 0 then
        return
    end
    for _, top in ipairs(app:getMenuItems()) do
        if top.AXTitle == "Window" and top.AXChildren and top.AXChildren[1] then
            for _, item in ipairs(top.AXChildren[1]) do
                local title = item.AXTitle or ""
                if item.AXEnabled and title:sub(1, #prefix) == prefix then
                    app:selectMenuItem({"Window", title})
                    return
                end
            end
        end
    end
end

local function launchApplications()
    launchAlacritty()
    openApplication("com.google.Chrome", "/Applications/Google Chrome.app")
    openApplication("ru.yandex.yamb", "/Applications/Yandex Messenger.app")
    openApplication("ru.keepcoder.Telegram", "/Applications/Telegram.app")
    openApplication("md.obsidian", "/Applications/Obsidian.app")
    hs.timer.doAfter(1, function()
        reopenWindow("ru.yandex.yamb", "Yandex Messenger")
        reopenWindow("ru.keepcoder.Telegram", "Telegram @")
        local obsidian = hs.application.get("md.obsidian")
        if obsidian and #obsidian:allWindows() == 0 then
            obsidian:selectMenuItem({"File", "New Window"})
        end
    end)
end

function M.run()
    launchApplications()
    hs.timer.doAfter(2, hideHandyWindow)
    for delay = 1, 12 do
        hs.timer.doAfter(delay, function()
            for bundleID in pairs(targets) do
                placeApplication(bundleID)
            end
            hideHandyWindow()
        end)
    end
end

M.watcher = hs.application.watcher.new(function(_, event, app)
    if event == hs.application.watcher.launched then
        local bundleID = app:bundleID()
        if targets[bundleID] then
            hs.timer.doAfter(1, function() placeApplication(bundleID) end)
        elseif bundleID == "com.pais.handy" then
            hs.timer.doAfter(1, hideHandyWindow)
        end
    end
end)

function M.start()
    M.watcher:start()
    local bootTime = hs.execute("/usr/sbin/sysctl -n kern.boottime"):match("sec%s*=%s*(%d+)")
    if bootTime and hs.settings.get("startupLayoutBootTime") ~= bootTime then
        hs.settings.set("startupLayoutBootTime", bootTime)
        hs.timer.doAfter(4, M.run)
    end
end

return M
