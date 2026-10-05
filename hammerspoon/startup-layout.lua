local M = {}
local spaces = require("hs.spaces")
local settingsKey = "savedWorkspaceLayoutV1"
local processKey = "savedWorkspaceLayoutRestoredProcess"
local log = hs.logger.new("workspace", "info")

local function bootTime()
    return hs.execute("/usr/sbin/sysctl -n kern.boottime"):match("sec%s*=%s*(%d+)")
end

local function rectangle(frame)
    return {x = frame.x, y = frame.y, w = frame.w, h = frame.h}
end

local function desktops(screen)
    local result = {}
    for _, id in ipairs(spaces.spacesForScreen(screen) or {}) do
        if spaces.spaceType(id) == "user" then
            table.insert(result, id)
        end
    end
    return result
end

local function windows()
    local result = {}
    for _, window in ipairs(M.filter:getWindows()) do
        local app = window:application()
        if window:isStandard() and app and app:bundleID()
            and app:bundleID() ~= "org.hammerspoon.Hammerspoon" and window:screen() then
            table.insert(result, window)
        end
    end
    table.sort(result, function(a, b) return a:id() < b:id() end)
    return result
end

local function desktopIndex(window, screen)
    local membership = {}
    for _, id in ipairs(spaces.windowSpaces(window) or {}) do
        membership[id] = true
    end
    local index = 0
    for _, id in ipairs(spaces.spacesForScreen(screen) or {}) do
        if spaces.spaceType(id) == "user" then
            index = index + 1
        end
        if membership[id] then
            return math.max(index, 1)
        end
    end
    return 1
end

function M.save()
    if M.restoring then
        return nil, "Дождись завершения восстановления"
    end
    local snapshot = {version = 1, savedAt = os.time(), boot = bootTime(), windows = {}}
    for _, window in ipairs(windows()) do
        local app = window:application()
        local screen = window:screen()
        table.insert(snapshot.windows, {
            bundleID = app:bundleID(), appName = app:name(), appPath = app:path(),
            title = window:title() or "", windowID = window:id(),
            screenUUID = screen:getUUID(), screenName = screen:name(),
            desktop = desktopIndex(window, screen), frame = rectangle(window:frame()),
            screenFrame = rectangle(screen:frame()), fullscreen = window:isFullScreen(),
            minimized = window:isMinimized(), hidden = app:isHidden(),
        })
    end
    if #snapshot.windows == 0 then
        return nil, "Нет доступных окон; прежняя раскладка сохранена"
    end
    hs.settings.set(settingsKey, snapshot)
    hs.settings.set(processKey, hs.processInfo.processID)
    M.lastResult = {saved = #snapshot.windows, savedAt = snapshot.savedAt}
    return #snapshot.windows
end

local function matchingWindows(snapshot)
    local available = windows()
    local matches, used = {}, {}
    local sameBoot = snapshot.boot == bootTime()
    local predicates = {
        function(record, window)
            return sameBoot and record.windowID == window:id()
        end,
        function(record, window)
            return record.title ~= "" and record.title == window:title()
        end,
        function() return true end,
    }
    for _, predicate in ipairs(predicates) do
        for index, record in ipairs(snapshot.windows) do
            if not matches[index] then
                for _, window in ipairs(available) do
                    if not used[window:id()] and window:application():bundleID() == record.bundleID
                        and predicate(record, window) then
                        matches[index] = window
                        used[window:id()] = true
                        break
                    end
                end
            end
        end
    end
    return matches
end

local function targetScreen(record)
    for _, screen in ipairs(hs.screen.allScreens()) do
        if screen:getUUID() == record.screenUUID then return screen end
    end
    for _, screen in ipairs(hs.screen.allScreens()) do
        if screen:name() == record.screenName then return screen end
    end
    return hs.screen.primaryScreen()
end

local function targetFrame(record, screen)
    local old, current = record.screenFrame, screen:frame()
    local frame = record.frame
    if old.w == current.w and old.h == current.h then
        return {x = current.x + frame.x - old.x, y = current.y + frame.y - old.y, w = frame.w, h = frame.h}
    end
    return {
        x = current.x + (frame.x - old.x) * current.w / old.w,
        y = current.y + (frame.y - old.y) * current.h / old.h,
        w = math.min(frame.w * current.w / old.w, current.w),
        h = math.min(frame.h * current.h / old.h, current.h),
    }
end

local function place(window, record)
    local screen = targetScreen(record)
    local space = desktops(screen)[record.desktop]
    if not space then return false, "Рабочий стол ещё недоступен" end
    if window:isFullScreen() then
        if record.fullscreen and window:screen():getUUID() == screen:getUUID() then return true end
        window:setFullScreen(false)
        return false, "Выход из полноэкранного режима"
    end
    if window:isMinimized() then window:unminimize() end
    local frame = targetFrame(record, screen)
    window:setFrame(frame, 0)
    local onTarget = false
    for _, id in ipairs(spaces.windowSpaces(window) or {}) do
        if id == space then onTarget = true end
    end
    if not onTarget then
        local ok, err = spaces.moveWindowToSpace(window, space)
        if not ok then return false, err end
    end
    window:setFrame(frame, 0)
    local actual = window:frame()
    if math.abs(actual.x - frame.x) > 3 or math.abs(actual.y - frame.y) > 3
        or math.abs(actual.w - frame.w) > 3 or math.abs(actual.h - frame.h) > 3 then
        return false, "Приложение пока не применило размер окна"
    end
    if record.fullscreen then window:setFullScreen(true) end
    if record.minimized then window:minimize() end
    return true
end

local function stopRestore(pending)
    if M.restoreTimer then M.restoreTimer:stop(); M.restoreTimer = nil end
    M.restoring = false
    M.lastResult = {restored = M.total - #pending, pending = pending, finishedAt = os.time()}
    for bundleID in pairs(M.hiddenApps or {}) do
        local app = hs.application.get(bundleID)
        if app then app:hide() end
    end
    if #pending > 0 then
        log.w("Unrestored windows: " .. hs.json.encode(pending))
        hs.notify.new(nil, {title = "Расположение окон", informativeText = "Часть окон ещё не открыта. Раскладка сохранена; восстановление можно повторить из меню ▦."}):send()
    else
        hs.settings.set(processKey, hs.processInfo.processID)
        log.i("Restored " .. M.total .. " windows")
    end
end

function M.run()
    local snapshot = hs.settings.get(settingsKey)
    if not snapshot or #snapshot.windows == 0 then return nil, "Сначала сохрани раскладку" end
    if M.restoreTimer then M.restoreTimer:stop() end
    M.restoring, M.total, M.hiddenApps, M.tasks = true, #snapshot.windows, {}, {}
    local counts, apps = {}, {}
    for _, record in ipairs(snapshot.windows) do
        local screen = targetScreen(record)
        local uuid = screen:getUUID()
        counts[uuid] = math.max(counts[uuid] or 0, record.desktop)
        apps[record.bundleID] = record.appPath
        if record.hidden then M.hiddenApps[record.bundleID] = true end
    end
    for uuid, count in pairs(counts) do
        while #desktops(uuid) < count do
            local ok, err = spaces.addSpaceToScreen(uuid)
            if not ok then log.e(tostring(err)); break end
        end
    end
    local current = windows()
    for bundleID, path in pairs(apps) do
        local hasWindow = false
        for _, window in ipairs(current) do
            if window:application():bundleID() == bundleID then hasWindow = true; break end
        end
        if not hasWindow then
            local task = hs.task.new("/usr/bin/open", function() end, {"-g", "-a", path})
            table.insert(M.tasks, task)
            task:start()
        end
    end
    local deadline, stable = os.time() + 120, 0
    local function attempt()
        local matches, pending = matchingWindows(snapshot), {}
        for index, record in ipairs(snapshot.windows) do
            local window = matches[index]
            local ok, placed, err = false, false, "Окно ещё не открыто"
            if window then ok, placed, err = pcall(place, window, record) end
            if not ok or not placed then
                table.insert(pending, {app = record.appName, desktop = record.desktop, reason = tostring(err or placed)})
            end
        end
        stable = #pending == 0 and stable + 1 or 0
        if stable >= 3 or os.time() >= deadline then stopRestore(pending) end
    end
    M.restoreTimer = hs.timer.doEvery(2, attempt)
    attempt()
    return M.total
end

function M.status()
    local snapshot = hs.settings.get(settingsKey)
    return {restoring = M.restoring or false, saved = snapshot and #snapshot.windows or 0, lastResult = M.lastResult}
end

function M.start()
    M.filter = hs.window.filter.new(true)
    M.menu = hs.menubar.new():setTitle("▦")
    M.menu:setMenu({
        {title = "Восстановить расположение окон", fn = M.run},
        {title = "Запомнить нынешнее расположение", fn = function()
            local count, err = M.save()
            hs.alert.show(count and ("Сохранено окон: " .. count) or err)
        end},
    })
    local snapshot = hs.settings.get(settingsKey)
    if not snapshot then
        M.save()
    elseif hs.settings.get(processKey) ~= hs.processInfo.processID then
        M.startTimer = hs.timer.doAfter(5, M.run)
    end
end

return M
