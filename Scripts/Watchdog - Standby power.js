/******************** CONFIG ********************/
let CFG = {
  // Goals (W): scene triggers only if, during the whole 24h window,
  // each phase always had min_act_power > goalW.<phase>
  goalW: { a: 10, b: 10, c: 10 },

  // Poll min_act_power every 60 seconds
  pollEverySec: 60,

  // Evaluate once per 24 hours
  evalEverySec: 24 * 60 * 60,

  // Cloud credentials and URL are located under Shelly Cloud > User Setting > Authorization cloud key
  authKey: "someLoooongShellyApiKey",  
  
  // Shelly Cloud scene trigger base 
  cloudBaseUrl: "https://someserver.shelly.cloud/scene/manual_run",

  // Scene ID is located under the 'i' button in the Shelly Cloud (in related scene)
  sceneId: "123456789",

  // For EMData.GetData bucket selection; if you see empty results sometimes, set to 120
  tsOffsetSec: 60
};
/****************** END CONFIG ******************/

// Flags: true means this phase was under/at goal at least once during the window
let underGoal = { a: false, b: false, c: false };

// Store last measured min power
let recentMinPower = { a: 0, b: 0, c: 0};

// Index mapping from your EMData.GetData "keys" list
let IDX = { a_min: 7, b_min: 23, c_min: 39 };

function resetWindow() { underGoal = { a: false, b: false, c: false }; }
function unixNow() { return Math.floor(Date.now() / 1000); }

function addQuery(url, k, v) {
  let sep = (url.indexOf("?") >= 0) ? "&" : "?";
  return url + sep + k + "=" + v;
}

function pollMinActPower() {
  // Request a finished 60s period by using a timestamp in the past
  let ts = unixNow() - CFG.tsOffsetSec;

  Shelly.call("EMData.GetData", { id: 0, ts: ts }, function (res, err) {
    if (err || !res || !res.data || res.data.length === 0) {
      print("EMData.GetData error/empty:", JSON.stringify(err));
      return;
    }
    let rows = res.data[0].values;
    if (!rows || rows.length === 0) return;

    // Take last returned row
    let v = rows[rows.length - 1];

    recentMinPower.a = v[IDX.a_min];
    recentMinPower.b = v[IDX.b_min];
    recentMinPower.c = v[IDX.c_min];

    if (recentMinPower.a <= CFG.goalW.a) underGoal.a = true;
    if (recentMinPower.b <= CFG.goalW.b) underGoal.b = true;
    if (recentMinPower.c <= CFG.goalW.c) underGoal.c = true;
  });
}

function allUnderGoal() {
  return underGoal.a && underGoal.b && underGoal.c;
  // true means: all phases went under/at goal in the whole window
}

function triggerCloudScene() {

  let url = CFG.cloudBaseUrl;
  url = addQuery(url, "auth_key", CFG.authKey);
  url = addQuery(url, "id", CFG.sceneId);

  Shelly.call("HTTP.Request", { method: "GET", url: url, timeout: 15 }, function (res, err) {
    if (err) {
      print("Scene trigger error:", JSON.stringify(err));
      return;
    }
    print("Scene trigger HTTP", res.code, "body:", res.body);
  });
}

function evalWindow() {
  let allUnder = allUnderGoal();
  print("24h eval underGoal:", JSON.stringify(underGoal), "=> ALL_PASSED? : ", allUnder);

  if (!allUnder) triggerCloudScene();
  resetWindow();
}

function printNextTimerInvocation(timerHandle) {
  let info = Timer.getInfo(timerHandle);
  if (!info || info.next === undefined || info.next === null) {
    print("timer next invocation: (unknown)");
    return;
  }
  
  // info.next is ms since boot (uptime-based)
  // Convert to wall-clock epoch using current epoch and current uptime.
  let nowEpochMs = Date.now();
  let upMs = Shelly.getUptimeMs();
  let bootEpochMs = nowEpochMs - upMs;

  let nextEpochMs = bootEpochMs + info.next;

  let d = new Date(nextEpochMs);
  let hh = ("0" + d.getHours()).slice(-2);
  let mm = ("0" + d.getMinutes()).slice(-2);
  print("timer next invocation: " + hh + ":" + mm);
}

/************** TIMERS **************/
resetWindow();
pollMinActPower();
let pollTimer = Timer.set(CFG.pollEverySec * 1000, true, pollMinActPower);
let evalTimer = Timer.set(CFG.evalEverySec * 1000, true, evalWindow);

/* 
By entering this command into the console, 
you can display the current status of all phase goals and recent min powers
print("min_act_power:", JSON.stringify(recentMinPower), "underGoal:", JSON.stringify(underGoal));

This can display time of next timer invocation
printNextTimerInvocation(evalTimer);

v 1.0
*/