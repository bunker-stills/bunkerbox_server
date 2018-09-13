var _ = require("underscore");
var pid = require("./../utils/pid_new");
var vm = require('vm');

var sim_mode = !_.isUndefined(process.env.SIM_MODE);

if (!sim_mode) {
    var si = require("./../sensor_interface.js");
    var pcduino = require("pcduino");
    var digital = pcduino.digital;
    var sensor_interface;
}

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

        if(!new_value)
        {
            custom_function.script = undefined;

            if(custom_function.output)
            {
                custom_function.output.setValue("");
            }

            return;
        }

        try
        {
            var script_code = "var _return_value; function custom(){" + new_value + "}; _return_value = custom();";
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

    custom_function.enable = node330.createVirtualComponent(id + "Enable", node330.valueTypes.SWITCH);
    node330.exposeVirtualComponentToViewers(custom_function.enable, false);

    custom_function.output = node330.createVirtualComponent(id + "Output", node330.valueTypes.INTEGER);
    custom_function.output.setValue("");
    node330.exposeVirtualComponentToViewers(custom_function.output, true);

    return custom_function;
}

function create_PID_interface(node330, pidComponent, config, id, dac_channel) {
    var pid_info = {
        pid: pidComponent,
        dac_channel: dac_channel
    };

    pid_info.enable = node330.createVirtualComponent(id + "PIDEnable", node330.valueTypes.SWITCH);
    pid_info.enable.on("value_set", function(new_value){

        if(new_value == true)
        {
            node330.setVirtualComponentReadOnly(pid_info.cv, true);
            node330.setVirtualComponentReadOnly(pid_info.integral, true);
        }
        else {
            node330.setVirtualComponentReadOnly(pid_info.cv, false);
            node330.setVirtualComponentReadOnly(pid_info.integral, false);
        }

        // If the PID was previously running, go ahead and reset some things
        if(pid_info.is_running)
        {
            pid_info.pid.reset();
            pid_info.cv.setValue(0);
            pid_info.integral.setValue(0);
        }

        pid_info.is_running = new_value;
    });
    node330.exposeVirtualComponentToViewers(pid_info.enable, true);

    pid_info.process_sensor = node330.createVirtualComponent(id + "ProcessSensor", node330.valueTypes.STRING);
    pid_info.process_sensor.setValue(config.getSetting(id + "_process_sensor", ""));
    pid_info.process_sensor.on("value_set", function(new_value){
        config.setSetting(id + "_process_sensor", new_value);
    });
    node330.exposeVirtualComponentToViewers(pid_info.process_sensor, false);

    pid_info.process_value = node330.createVirtualComponent(id + "ProcessValue", node330.valueTypes.INTEGER);
    node330.exposeVirtualComponentToViewers(pid_info.process_value, false);

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

    pid_info.is_running = false;

    return pid_info;
}

function set_dac_output(dac_channel, cv) {
    if (sensor_interface) {
        sensor_interface.setDAC(dac_channel, cv);
    }
}

function update_process_sensor_for_pid(node330, pid_info)
{
    var process_sensor = node330.getVirtualComponentNamed(pid_info.process_sensor.getValue());

    if (process_sensor) {
        pid_info.process_value.setValue(Number(process_sensor.getValue()));
    }
    /*else
    {
        pid_info.process_sensor.setValue("");
        pid_info.process_value.setValue("");
        pid_info.enable.setValue(false);
    }*/
}

function during_MANUAL(node330) {
    _.each(pids, function (pid_info) {

        if (pid_info.enable.getValue()) {
            // Process our PID
            pid_info.pid.setControlValueLimits(pid_info.cv_min.getValue() || 0, pid_info.cv_max.getValue() || 0);
            pid_info.pid.setProportionalGain(pid_info.p_gain.getValue() || 0);
            pid_info.pid.setIntegralGain(pid_info.i_gain.getValue() || 0);
            pid_info.pid.setDerivativeGain(pid_info.d_gain.getValue() || 0);
            pid_info.pid.setDesiredValue(pid_info.set_point.getValue() || 0);

            var new_cv = Math.round(pid_info.pid.update(pid_info.process_value.getValue() || 0));
            pid_info.cv.setValue(new_cv);

            pid_info.integral.setValue(pid_info.pid.getIntegral());
        }
        else {
            // Set our integral to whatever the user sets it to
            pid_info.pid.setIntegral(pid_info.integral.getValue() || 0);
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
                                 floatSwitch,
                                 preHeaterPID,
                                 mainHeaterPID,
                                 pumpPID,
                                 config) {
    if (!sim_mode) {
        sensor_interface = new si(node330);
        digital.pinMode(config.getSetting("float_switch_pin"), digital.INPUT_PU);

        sensor_interface.begin();
        sensor_interface.on("new_sensor", function (newSensorName, newSensorValueType, sensorType) {

            var virtualSensorName = newSensorName;

            if(sensorType == "TEMPERATURE")
            {
                virtualSensorName = "TEMP_" + newSensorName;
            }

            node330.logInfo("Found new sensor " + virtualSensorName);

            var physical_sensor = node330.createPhysicalComponentWithValueFunction(newSensorValueType, function () {
                return sensor_interface.getSensorValue(newSensorName);
            });

            var virtual_type = node330.valueTypes.TEMP_IN_F;

            if (sensorType == "PRESSURE") {
                virtual_type = node330.valueTypes.PRES_IN_MBAR;
            }

            var virtual_sensor = node330.createVirtualComponent(virtualSensorName, virtual_type);

            node330.mapPhysicalComponentToVirtualComponent(physical_sensor, virtual_sensor);

            var virtual_sensor_calibration = node330.createVirtualComponent(virtualSensorName + "_CALIBRATION", virtual_type);
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
    mode.on("value_set", function(new_value){

        // If set to manual, allow PIDs to be enabled and CVs set, otherwise don't
        if(new_value.toUpperCase() == "MANUAL")
        {
            _.each(pids, function (pid_info) {
                node330.setVirtualComponentReadOnly(pid_info.enable, false);
                node330.setVirtualComponentReadOnly(pid_info.cv, false);
            });
        }
        else
        {
            _.each(pids, function (pid_info) {
                node330.setVirtualComponentReadOnly(pid_info.enable, true);
                node330.setVirtualComponentReadOnly(pid_info.cv, true);
            });
        }

    });
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

    pids.push(create_PID_interface(node330, preHeaterPID, config, "preHeater", config.getSetting("preHeaterChannel")));
    pids.push(create_PID_interface(node330, mainHeaterPID, config, "mainHeater", config.getSetting("mainHeaterChannel")));
    pids.push(create_PID_interface(node330, pumpPID, config, "pump", config.getSetting("pumpChannel")));

    custom_functions.push(create_custom_function(node330, config, "function1"));
    custom_functions.push(create_custom_function(node330, config, "function2"));
    custom_functions.push(create_custom_function(node330, config, "function3"));

    node330.exposeVirtualComponentToViewers(node330.createVirtualComponent("variable1", node330.valueTypes.INTEGER), false);
    node330.exposeVirtualComponentToViewers(node330.createVirtualComponent("variable2", node330.valueTypes.INTEGER), false);
    node330.exposeVirtualComponentToViewers(node330.createVirtualComponent("variable3", node330.valueTypes.INTEGER), false);

    node330.addViewer(node330.restViewer());
    node330.addViewer(node330.webViewer());
};

function checkOverheat()
{
    for(var tempProbeIndex = 0; tempProbeIndex < temp_probes.length; tempProbeIndex++)
    {
        var tempProbe = temp_probes[tempProbeIndex];

        if(tempProbe.getValue() >= 215)
        {
            mode.setValue("COOLDOWN");
            node330.logWarning("Shutting down due to temperature overheat.");
            return true;
        }
    }

    return false;
}

module.exports.loop = function (node330,
                                config,
                                floatSwitch) {

    _.each(pids, function (pid_info) {
        update_process_sensor_for_pid(node330, pid_info);
    });

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
    _.each(node330.exposedComponents, function (component) {

        // Remove any functions themselves from the list
        if(_.find(custom_functions, function(custom_function){
            return (component === custom_function.code);
        })){
            return;
        }

        component_values[component.name] = component.getValue();
    });

    // Evaluate our custom functions
    _.each(custom_functions, function (custom_function) {
        if (custom_function.enable.getValue() && custom_function.script) {
            component_values = _.omit(component_values, ["_return_value", "custom"]);
            try {
                custom_function.script.runInNewContext(component_values);
                custom_function.output.setValue(component_values["_return_value"]);

                _.each(node330.exposedComponents, function (component) {
                    if (!component.viewerReadOnly && !_.isUndefined(component_values[component.name]) && component.getValue() !== component_values[component.name]) {
                        component.setValue(component_values[component.name]);
                    }
                });
            }
            catch (err) {
                custom_function.output.setValue("ERROR: " + err.toString());
            }
        }
    });

    switch (mode.getValue().toUpperCase()) {
        case "MANUAL": {
            if(!checkOverheat())
            {
                during_MANUAL(node330);
            }
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