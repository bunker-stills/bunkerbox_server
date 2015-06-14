var _ = require("underscore");
//var si = require("./../sensor_interface.js");
//var pcduino = require("pcduino");
//var digital = pcduino.digital;
//var sensor_interface;

module.exports.setup = function (
    node330,
    config,
    operationState,
    startStopSwitch,
    preHeaterPGain,
    preHeaterIGain,
    preHeaterDGain,
    mainHeaterPGain,
    mainHeaterIGain,
    mainHeaterDGain
) {
    // Define our states
    node330.defineState("IDLE", IDLE_STATE_LOOP, IDLE_STATE_ENTER);
    node330.defineState("WARMUP", WARMUP_STATE_LOOP, WARMUP_STATE_ENTER);
    node330.defineState("RUNNING", RUNNING_STATE_LOOP, RUNNING_STATE_ENTER);
    node330.defineState("SHUTDOWN", SHUTDOWN_STATE_LOOP, SHUTDOWN_STATE_ENTER);

    node330.defineStateEvent("START", ["IDLE", "SHUTDOWN"], "RUNNING");
    node330.defineStateEvent("STOP", ["WARMUP", "RUNNING"], "SHUTDOWN");
    node330.defineStateEvent("MOVE_ON", "SHUTDOWN", "IDLE"); // Move from shutdown to idle

    node330.setCurrentState("IDLE");

    // Define our types of inputs and outputs
    operationState.setValueType(node330.valueTypes.STRING);

    // Set our initial values
    startStopSwitch.setValue(false);

    preHeaterPGain.setValue(config.getSetting("pre_heater_p_gain"));
    preHeaterIGain.setValue(config.getSetting("pre_heater_i_gain"));
    preHeaterDGain.setValue(config.getSetting("pre_heater_d_gain"));

    mainHeaterPGain.setValue(config.getSetting("main_heater_p_gain"));
    mainHeaterIGain.setValue(config.getSetting("main_heater_i_gain"));
    mainHeaterDGain.setValue(config.getSetting("main_heater_d_gain"));

    node330.exposeVirtualComponentToViewers(startStopSwitch, false);
    node330.exposeVirtualComponentToViewers(operationState);

    node330.addViewer(node330.restViewer());
    node330.addViewer(node330.webViewer());
};

function IDLE_STATE_ENTER() {
}

function IDLE_STATE_LOOP() {
}

function WARMUP_STATE_ENTER() {
}

function WARMUP_STATE_LOOP() {
}

function RUNNING_STATE_ENTER() {
}

function RUNNING_STATE_LOOP() {
}

function SHUTDOWN_STATE_ENTER() {
}

function SHUTDOWN_STATE_LOOP(
    node330
) {
    node330.raiseStateEvent("MOVE_ON");
}

// Loop executed all the time
module.exports.loop = function (
    node330,
    config,
    operationState,
    startStopSwitch,
    preHeaterPGain,
    preHeaterIGain,
    preHeaterDGain,
    mainHeaterPGain,
    mainHeaterIGain,
    mainHeaterDGain
) {
    var currentState = node330.getCurrentState();
    operationState.setValue(currentState);

    if(startStopSwitch.isOff())
    {
        if(currentState == "WARMUP" || currentState == "RUNNING")
        {
            node330.raiseStateEvent("STOP");
        }
    }
    else if(currentState == "IDLE" || currentState == "SHUTDOWN")
    {
        node330.raiseStateEvent("START");
    }


};
