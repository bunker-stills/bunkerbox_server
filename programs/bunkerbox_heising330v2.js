var _ = require("underscore");
var vm = require('vm');

var sim_mode = true;

if (!sim_mode) {
    var si = require("./../sensor_interface.js");
    var pcduino = require("pcduino");
    var digital = pcduino.digital;
    var sensor_interface;
}

var pumpChannel = 0;
var mainHeaterChannel = 0;
var preHeaterChannel = 0;
var pids = [];
var temp_probes = [];
var mode;
var float_switch_count = 0;
var custom_functions = [];

function create_custom_function(node330, config, id)
{
    var custom_function = {};
    custom_function.code = node330.createVirtualComponent(id + "Code", node330.valueTypes.STRING);
    custom_function.code.on("value_set", function(new_value){
        try
        {
            var script_code = "function custom(){" + new_value + "}; _return_value = custom();";
            custom_function.script = vm.createScript(script_code);
            config.setSetting(id + "_code", new_value);

        }
        catch(e)
        {
            custom_function.output.setValue("ERROR: " + e.toString());
        }
    });
    custom_function.code.setValue(config.getSetting(id + "_code", ""));
    node330.exposeVirtualComponentToViewers(custom_function.code, false);

    custom_function.output = node330.createVirtualComponent(id + "Output", node330.valueTypes.INTEGER);
    custom_function.output.setValue("");
    node330.exposeVirtualComponentToViewers(custom_function.output, true);

    return custom_function;
}

function create_PID_interface(node330, config, pid_component, id, dac_channel) {
    var pid_info = {
        pid: pid_component,
        dac_channel: dac_channel
    };

    pid_info.enable = node330.createVirtualComponent(id + "PIDEnable", node330.valueTypes.SWITCH);
    node330.exposeVirtualComponentToViewers(pid_info.enable, false);

    pid_info.process_sensor = node330.createVirtualComponent(id + "ProcessSensor", node330.valueTypes.STRING);
    pid_info.process_sensor.setValue(config.getSetting(id + "_process_sensor", ""));
    pid_info.process_sensor.on("value_set", function(new_value){
        config.setSetting(id + "_process_sensor", new_value);
    });
    node330.exposeVirtualComponentToViewers(pid_info.process_sensor, false);

    pid_info.process_value = node330.createVirtualComponent(id + "ProcessValue", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.process_value, true);

    pid_info.set_point = node330.createVirtualComponent(id + "SetPoint", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.set_point, false);

    pid_info.p_gain = node330.createVirtualComponent(id + "PGain", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.p_gain, false);

    pid_info.i_gain = node330.createVirtualComponent(id + "IGain", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.i_gain, false);

    pid_info.d_gain = node330.createVirtualComponent(id + "DGain", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.d_gain, false);

    pid_info.cv_min = node330.createVirtualComponent(id + "CVMin", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.cv_min, false);

    pid_info.cv_max = node330.createVirtualComponent(id + "CVMax", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.cv_max, false);

    pid_info.integral = node330.createVirtualComponent(id + "Integral", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.integral, true);

    pid_info.cv = node330.createVirtualComponent(id + "CV", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.cv, true);

    return pid_info;
}

function set_dac_output(dac_channel, cv) {
    if (sensor_interface) {
        sensor_interface.setDAC(dac_channel, cv);
    }
}

function during_MANUAL(node330) {
    _.each(pids, function (pid_info) {

        var process_sensor = node330.getVirtualComponentNamed(pid_info.process_sensor.getValue());

        // Don't allow the PID to be enabled if there is no process sensor
        if (process_sensor) {
            pid_info.process_value.setValue(Number(process_sensor.getValue()));
        }
        else
        {
            pid_info.process_sensor.setValue(undefined);
            pid_info.enable.setValue(false);
        }

        if (pid_info.enable.getValue()) {
            // CV and integral will be set by PID
            node330.setVirtualComponentReadOnly(pid_info.cv, true);
            node330.setVirtualComponentReadOnly(pid_info.integral, true);

            // Process our PID
            pid_info.pid.setControlValueLimits(pid_info.cv_min.getValue(), pid_info.cv_max.getValue(), 0);
            pid_info.pid.setProportionalGain(pid_info.p_gain.getValue());
            pid_info.pid.setIntegralGain(pid_info.i_gain.getValue());
            pid_info.pid.setDerivativeGain(pid_info.d_gain.getValue());
            pid_info.pid.setDesiredValue(pid_info.set_point.getValue());

            var new_cv = Math.round(pid_info.pid.update(pid_info.process_value.getValue()));
            pid_info.cv.setValue(new_cv);
        }
        else {
            // CV and integral can be manually set
            node330.setVirtualComponentReadOnly(pid_info.cv, false);
            node330.setVirtualComponentReadOnly(pid_info.integral, false);
        }

        set_dac_output(pid_info.dac_channel, pid_info.cv.getValue());
    });
}

function during_IDLE(node330) {
    // Turn all of our outputs off
    _.each(pids, function (pid_info) {
        pid_info.enable.setValue(false);
        pid_info.cv.setValue(0);
        set_dac_output(pid_info.dac_channel, 0);
    });
}

function during_COOLDOWN(node330) {
    // Automatically move to IDLE
    mode.setValue("IDLE");
}

module.exports.setup = function (node330,
                                 preHeaterPID,
                                 mainHeaterPID,
                                 pumpPID,
                                 floatSwitch,
                                 config) {
    if (!sim_mode) {
        sensor_interface = new si(node330);
        digital.pinMode(config.getSetting("float_switch_pin"), digital.INPUT_PU);

        sensor_interface.begin();
        sensor_interface.on("new_sensor", function (newSensorName, newSensorValueType, sensorType) {

            node330.logInfo("Found new sensor " + newSensorName);

            var physical_sensor = node330.createPhysicalComponentWithValueFunction(newSensorValueType, function () {
                return sensor_interface.getSensorValue(newSensorName);
            });

            var virtual_type = node330.valueTypes.TEMP_IN_F;

            if (sensorType == "PRESSURE") {
                virtual_type = node330.valueTypes.PRES_IN_MBAR;
            }

            var virtual_sensor = node330.createVirtualComponent(newSensorName, virtual_type);

            node330.mapPhysicalComponentToVirtualComponent(physical_sensor, virtual_sensor);

            var virtual_sensor_calibration = node330.createVirtualComponent(newSensorName + "Calibration", virtual_type);
            virtual_sensor_calibration.on("value_set", function (new_value) {
                virtual_sensor.setCalibrationOffset(new_value);
            });

            node330.exposeVirtualComponentToViewers(virtual_sensor, true);
            node330.exposeVirtualComponentToViewers(virtual_sensor_calibration, false);

            if (sensorType == "TEMPERATURE") {
                temp_probes.push(virtual_sensor);
            }
        });

        // When we lose a sensor
        sensor_interface.on("timeout", function (sensorName) {
            mode.setValue("COOLDOWN");
            node330.logError("Shutting down due to " + sensorName + " going offline.");
        });
    }

    mode = node330.createVirtualComponent("mode", node330.valueTypes.STRING);
    mode.setValue("IDLE");
    node330.exposeVirtualComponentToViewers(mode, false);

    var comments_updated = node330.createVirtualComponent("commentsUpdatedAt", node330.valueTypes.STRING);
    comments_updated.setValue("");

    var comments = node330.createVirtualComponent("comments", node330.valueTypes.STRING);
    comments.setValue("");
    comments.on("value_set", function(){
        var now = new Date();
        comments_updated.setValue(now.toLocaleDateString() + " " + now.toLocaleTimeString());
    });
    node330.exposeVirtualComponentToViewers(comments, false);
    node330.exposeVirtualComponentToViewers(comments_updated, true);

    node330.exposeVirtualComponentToViewers(floatSwitch, true);

    pids.push(create_PID_interface(node330, config, preHeaterPID, "preHeater", config.getSetting("preHeaterChannel")));
    pids.push(create_PID_interface(node330, config, mainHeaterPID, "mainHeater", config.getSetting("mainHeaterChannel")));
    pids.push(create_PID_interface(node330, config, mainHeaterPID, "pumpPID", config.getSetting("pumpChannel")));

    custom_functions.push(create_custom_function(node330, config, "function1"));
    custom_functions.push(create_custom_function(node330, config, "function2"));
    custom_functions.push(create_custom_function(node330, config, "function3"));

    node330.addViewer(node330.restViewer());
    node330.addViewer(node330.webViewer());
};

module.exports.loop = function (node330,
                                config,
                                floatSwitch) {
    if (!sim_mode) {
        floatSwitch.setValue(digital.digitalRead(config.getSetting("float_switch_pin")));

        // If the float switch gets activated, it means we're out of wash, and we should shut down.
        if (floatSwitch.isOff()) {
            float_switch_count++;

            // Give ourselves 10 counts (10 seconds) before we consider the feedstock really depleted.
            if (float_switch_count >= 10) {
                mode.setValue("COOLDOWN");
                node330.logWarning("Shutting down due to feedstock depletion.");
            }
        }
    }

    // Get the current values of all of our components
    var component_values = {};
    _.each(node330.exposedComponents, function(component){
        component_values[component.name] = component.getValue();
    });

    // Evaluate our custom functions

    _.each(custom_functions, function(custom_function){
        if(custom_function.script)
        {
            var sandbox = _.omit(component_values, [custom_function.code.name]);
            try {
                custom_function.script.runInNewContext(sandbox);
                custom_function.output.setValue(sandbox["_return_value"]);
            }
            catch(err)
            {
                custom_function.output.setValue("ERROR: " + err.toString());
            }
        }
    });

    switch (mode.getValue().toUpperCase()) {
        case "MANUAL": {
            during_MANUAL(node330);
            break;
        }
        case "COOLDOWN": {
            during_COOLDOWN(node330);
            break;
        }
        case "IDLE":
        default: {
            float_switch_count = 0;
            during_IDLE(node330);
            break;
        }
    }
};