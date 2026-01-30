// --- USER CONFIGURATION ---
let CFG = {
  // Typically 100 for first switch add-on
  switchAddonId: 100,
  
  // Virtual input (Boolean) component ID, typically 200
  // You need to create it in the local web of Shelly EM under Components > User-defined components
  // You can see ID in above page or open http://localShellyIp/rpc/Shelly.GetComponents
  // The state of the virtual input can also be seen in http://localShellyIp/rpc/Boolean.GetStatus?id=200
  // If you want the button to be visible in the mobile app or cloud, create a User-defined group on the same page
  virtualBooleanId: 200, 

  // Cloud credentials and URL are located under Shelly Cloud > User Setting > Authorization cloud key
  authKey: "someLoooongShellyApiKey",
  
  // Shelly Cloud scene trigger base 
  cloudBaseUrl: "https://someserver.shelly.cloud/scene/manual_run",
  
  // Scene ID is located under the 'i' button in the Shelly Cloud (in related scene)
  sceneId: "123456789"
};

let DOG_BARKS = 0;

// --- FUNCTION TO TURN SWITCH ON/OFF ---
function setSwitch(state) {
  Shelly.call(
    "Switch.Set",
    { id: CFG.switchAddonId, on: state },
    function (res, err_code, err_msg) {
      if (err_code) print("Switch error:", err_msg);
      else print("Switch set to", state ? "ON" : "OFF");
    }
  );
}

// --- FUNCTION TO SET User-defined Boolean ON/OFF ---
function setDefinedBoolean(state) {
  Shelly.call(
    "Boolean.Set",
    { id: CFG.virtualBooleanId, value: state },
    function (res, err_code, err_msg) {
      if (err_code) print("User-defined Boolean error:", err_msg);
      else print("User-defined Boolean set to", state ? "true" : "false");
    }
  );
}

// --- Funcion to notify user Via Shelly Cloud Scene ---
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

function addQuery(url, k, v) {
  let sep = (url.indexOf("?") >= 0) ? "&" : "?";
  return url + sep + k + "=" + v;
}

// --- FUNCTION TO MONITOR PHASES ---
function checkPower() {
  if (DOG_BARKS == 1) { // Waits until the user manually resets the user-defined boolean
  return;
  }
  Shelly.call(
    "EM.GetStatus",
    { id: 0 }, // Main device ID
    function (res, err_code, err_msg) {
      if (err_code) {
        print("EM.GetStatus error:", err_msg);
        return;
      }
      // For triphase profile: a_act_power, b_act_power, c_act_power
      let powers = [
        { phase: "A", value: res.a_act_power },
        { phase: "B", value: res.b_act_power },
        { phase: "C", value: res.c_act_power }
      ];
      for (let i = 0; i < powers.length; i++) {
        if (powers[i].value < 0) {
          print("Negative power on phase", powers[i].phase, ":", powers[i].value);
          setSwitch(false); // Turn off switch
          triggerCloudScene(); // Notify user
          DOG_BARKS = 1; // Skip further evaluation once the watchdog barks
          return; // Only need one negative phase power to trigger action
        }
      }
    }
  );
}

// --- FUNCTION TO HANDLE VIRTUAL BOOLEAN RESET ---
function checkVirtualBoolean() {
  Shelly.call(
    "Boolean.GetStatus",
    { id: CFG.virtualBooleanId },
    function (response, err_code, err_msg) {
      if (err_code) {
        print("Virtual Boolean error:", err_msg);
        return;
      }
      if (response.value === true) {
        print("Virtual Boolean triggered: Resetting Switch to ON");
        setSwitch(true);
        setDefinedBoolean(false);
        DOG_BARKS = 0;
      }
    }
  );
}

// --- INITIALISE ---
// Turn ON Switch on script start
setSwitch(true); 

// --- TIMERS ---
// Monitor phases every 5 seconds
Timer.set(5000, true, checkPower);

// Check virtual boolean every second
Timer.set(1000, true, checkVirtualBoolean);
