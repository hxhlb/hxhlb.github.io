// dump-views.js
// @param: slider | delaySec | Delay (Seconds) | 5 | 0-20
// Root-served Cyanide RepoTweak diagnostic helper. Dumps visible SpringBoard windows to /tmp and tries to present a share sheet.

(function () {
    "use strict";

    var VERSION = "1.1.1";

    function say(msg) {
        try { if (typeof log === "function") { log(String(msg)); return; } } catch (_) {}
        try { if (typeof console !== "undefined" && console.log) console.log(String(msg)); } catch (_) {}
    }

    function isPtr(v) {
        if (v === null || v === undefined) return false;
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string") return v !== "" && v !== "0" && v !== "0x0";
        return true;
    }

    function truthy(v) {
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string") return v !== "" && v !== "0" && v !== "0x0";
        return !!v;
    }

    function cls(name) { try { return r_class(name); } catch (_) { return 0; } }
    function msg(obj, sel, a1, a2, a3, a4) { if (!isPtr(obj)) return 0; try { return r_msg2(obj, sel, a1 || 0, a2 || 0, a3 || 0, a4 || 0); } catch (_) { return 0; } }
    function msgMain(obj, sel, a1, a2, a3, a4) { if (!isPtr(obj)) return 0; try { return r_msg2_main(obj, sel, a1 || 0, a2 || 0, a3 || 0, a4 || 0); } catch (_) { return 0; } }
    function ns(str) { try { return r_nsstr(String(str)); } catch (_) { return 0; } }
    function count(arrayObj) { var c = msgMain(arrayObj, "count"); var n = parseInt(c, 0); return isFinite(n) ? n : 0; }

    function appendText(target, text) {
        msgMain(target, "appendString:", ns(String(text)));
    }

    function appendRemoteLine(target, label, object) {
        appendText(target, label);
        if (!isPtr(object)) {
            appendText(target, "<nil>\n");
            return;
        }
        var description = msgMain(object, "description");
        if (isPtr(description)) msgMain(target, "appendString:", description);
        else appendText(target, "<description unavailable>");
        appendText(target, "\n");
    }

    function appendControllerTree(target, controller) {
        var seen = {};
        var emitted = 0;

        function walk(vc, depth, relation) {
            if (!isPtr(vc) || depth > 12 || emitted >= 160) return;
            var key = String(vc);
            var indent = new Array(depth + 1).join("  ");
            if (seen[key]) {
                appendText(target, indent + relation + ": <cycle " + key + ">\n");
                return;
            }
            seen[key] = true;
            emitted++;
            appendText(target, indent + relation + ": ");
            var description = msgMain(vc, "description");
            if (isPtr(description)) msgMain(target, "appendString:", description);
            else appendText(target, key);
            appendText(target, "\n");

            var children = msgMain(vc, "childViewControllers");
            var childCount = Math.min(count(children), 64);
            for (var childIndex = 0; childIndex < childCount; childIndex++) {
                walk(msgMain(children, "objectAtIndex:", childIndex), depth + 1, "child[" + childIndex + "]");
            }
            var presented = msgMain(vc, "presentedViewController");
            if (isPtr(presented)) walk(presented, depth + 1, "presented");
        }

        walk(controller, 0, "root");
        if (emitted >= 160) appendText(target, "  <controller tree truncated at 160 nodes>\n");
        return emitted;
    }

    function appendResponderChain(target, object) {
        appendText(target, "RESPONDER CHAIN\n");
        var current = object;
        var seen = {};
        for (var depth = 0; depth < 16 && isPtr(current); depth++) {
            var key = String(current);
            if (seen[key]) {
                appendText(target, "  <cycle " + key + ">\n");
                return;
            }
            seen[key] = true;
            appendRemoteLine(target, "  [" + depth + "] ", current);
            current = msgMain(current, "nextResponder");
        }
    }

    var delaySeconds = Number((typeof delaySec !== "undefined") ? delaySec : 5);
    if (!isFinite(delaySeconds)) delaySeconds = 5;
    if (delaySeconds < 0) delaySeconds = 0;
    if (delaySeconds > 20) delaySeconds = 20;
    var delayMs = Math.floor(delaySeconds * 1000);

    var dumpTimer = 0;

    function cleanup() {
        if (!dumpTimer) {
            say("[Dump-Views] Cleanup complete: no pending dump.");
            return;
        }
        clearTimeout(dumpTimer);
        dumpTimer = 0;
        say("[Dump-Views] Cleanup complete: cancelled pending dump.");
    }

    try {
        globalThis.cleanup = cleanup;
    } catch (_) {
        say("[Dump-Views] WARNING: cleanup export is unavailable in this JS runtime.");
    }

    say("[Dump-Views] v" + VERSION + ": waiting " + delaySeconds + "s. Navigate to the target view now...");

    dumpTimer = setTimeout(function () {
        dumpTimer = 0;
        say("[Dump-Views] Generating visible window dump...");

        var app = msgMain(cls("UIApplication"), "sharedApplication");
        var windows = msgMain(app, "windows");
        var winCount = count(windows);
        var fullDump = msgMain(cls("NSMutableString"), "string");
        var foundCount = 0;
        var rootVC = 0;

        say("[Dump-Views] Found " + winCount + " window(s). Starting traversal...");

        for (var i = winCount - 1; i >= 0; i--) {
            var progress = winCount - i;
            say("[Dump-Views] Window " + progress + "/" + winCount + " (index " + i + "): reading metadata...");
            var win = msgMain(windows, "objectAtIndex:", i);
            if (!isPtr(win)) {
                say("[Dump-Views] Window " + progress + "/" + winCount + ": unavailable; skipped.");
                continue;
            }
            var hidden = truthy(msgMain(win, "isHidden"));
            var windowRootVC = msgMain(win, "rootViewController");
            if (!rootVC && !hidden && isPtr(windowRootVC)) rootVC = windowRootVC;
            appendText(fullDump, "==========================================\n");
            appendText(fullDump, "WINDOW " + i + " hidden=" + hidden + "\n");
            appendText(fullDump, "==========================================\n");
            appendRemoteLine(fullDump, "window: ", win);
            appendRemoteLine(fullDump, "delegate: ", msgMain(win, "delegate"));
            appendRemoteLine(fullDump, "windowScene: ", msgMain(win, "windowScene"));
            appendText(fullDump, "VIEW CONTROLLERS\n");
            var controllerCount = 0;
            if (isPtr(windowRootVC)) controllerCount = appendControllerTree(fullDump, windowRootVC);
            else appendText(fullDump, "root: <nil>\n");
            appendResponderChain(fullDump, win);
            say("[Dump-Views] Window " + progress + "/" + winCount + ": metadata complete (hidden=" + hidden + ", controllers=" + controllerCount + ").");

            if (hidden) {
                appendText(fullDump, "VIEW TREE\n<skipped: window hidden>\n\n");
                foundCount++;
                say("[Dump-Views] Window " + progress + "/" + winCount + ": hidden view tree skipped.");
                continue;
            }
            say("[Dump-Views] Window " + progress + "/" + winCount + ": requesting recursiveDescription...");
            var dumpStr = msgMain(win, "recursiveDescription");
            say("[Dump-Views] Window " + progress + "/" + winCount + ": recursiveDescription returned.");
            appendText(fullDump, "VIEW TREE\n");
            if (isPtr(dumpStr)) msgMain(fullDump, "appendString:", dumpStr);
            else appendText(fullDump, "<recursiveDescription unavailable>");
            appendText(fullDump, "\n\n");
            foundCount++;
        }

        if (foundCount <= 0) {
            say("[Dump-Views] ERROR: UIApplication returned no windows.");
            return;
        }

        var timestamp = Math.floor(Date.now() / 1000);
        var path = "/tmp/UITreeDump_" + timestamp + ".txt";
        var pathStr = ns(path);
        say("[Dump-Views] Traversal complete. Writing " + foundCount + " window(s) to " + path + "...");
        var ok = msgMain(fullDump, "writeToFile:atomically:encoding:error:", pathStr, 1, 4, 0);
        if (!truthy(ok)) {
            say("[Dump-Views] ERROR: could not save " + path);
            return;
        }

        say("[Dump-Views] Wrote " + path + " (" + foundCount + " window(s)).");

        var keyWin = msgMain(app, "keyWindow");
        if (isPtr(keyWin)) {
            var keyRoot = msgMain(keyWin, "rootViewController");
            if (isPtr(keyRoot)) rootVC = keyRoot;
        }
        if (!isPtr(rootVC)) {
            say("[Dump-Views] No root view controller for share sheet; pull the file from /tmp manually.");
            return;
        }

        var fileUrl = msgMain(cls("NSURL"), "fileURLWithPath:", pathStr);
        var itemsArray = msgMain(cls("NSArray"), "arrayWithObject:", fileUrl);
        var activityVC = msgMain(msg(cls("UIActivityViewController"), "alloc"), "initWithActivityItems:applicationActivities:", itemsArray, 0);
        if (!isPtr(activityVC)) {
            say("[Dump-Views] Could not create share sheet; pull the file from /tmp manually.");
            return;
        }
        msgMain(rootVC, "presentViewController:animated:completion:", activityVC, 1, 0);
        say("[Dump-Views] Presented share sheet.");
    }, delayMs);
})();
