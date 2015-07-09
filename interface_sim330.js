var events = require('events');
var fs = require('fs');
var util = require('util');
var _ = require('underscore');
var node330_value_types = require("./node_modules/node330/lib/values330.js");
var rest = require('restler');

var simconigFilename = 'stillsim_H330'

var simulatorInterface = function(node330, apparatus_config)
{
    console.log("***DEBUG*** simulatorInterface entered")
    var self = this;

    var begun = false;
    var connected = false;
    var signalValues = {};
    var controlValues = {};
    var simstatus = {};
    var simstatusTimer;
    var watchdogTimer;
    var error_count = 0;


    function updateSignalValue(signalName, value, valueType)
    {
        var isNew = false;

        if(!(signalName in signalValues))
        {
            signalValues[signalName] = {};
            isNew = true;
        }

        signalValues[signalName].lastUpdate = Date.now();
        signalValues[signalName].value = value;
        signalValues[signalName].valueType = valueType;
        signalValues[signalName].timeouts = 0;

        if(isNew)
        {
            self.emit('new_signal', signalName, valueType);
        }
    }

    function getSimstatus()
    {
        rest.get(apparatus_config.simulatorIP + '/read_status', {timeout:60000})
            .on("timeout", function(ms) { simulatorTimeout(ms, 'read_status');})
            .on('complete', function(data, response)
            {
                if (data_is_OK(data, 'read_status'))
                {
                    simstatus = data;
                    _.each(apparatus_config.signalMap, function(sim_signm, signm, list) {
                        var sim_sig = simstatus[sim_signm[0]][sim_signm[1]];
                        if (sim_sig.units == 'K') { type = node330_value_types.TEMP_IN_K;}
                        else if (sim_sig.units == 'Pa') {type = node330_value_types.PRES_IN_PA;}
                        else if (sim_sig.units == 'm^3/s') {
                            type = node330_value_types.RATE_IN_CUBIC_METERS_PER_SECOND;
                            }
                        else if (sim_sig.units == 's') {type = node330_value_types.SECONDS;}
                        else if (sim_sig.units == '#') {type = node330_value_types.INTEGER;}
                        else if (sim_sig.units == '%') {type = node330_value_types.PERCENT;}
                        else if (sim_sig.type == 'FLOAT') {type = node330_value_types.FRACTION;}
                        else if (sim_sig.type == 'STRING') {type = node330_value_types.STRING;}
                        else  {type = node330_value_types.INTEGER;}
                        updateSignalValue(signm, sim_sig.value, type);
                    });
                    // Check that controls are at set values.
                    _.each(controlValues, function(spec, controlName, list) {
                        if (!_.isUndefined(spec.value) &&
                            simstatus[spec.status_section][spec.status_name].value != spec.value)
                        {
                            set_sim_control(spec);
                            console.log("***DEBUG*** Setting control '"+controlName+"'"+
                                        " to "+spec.value+
                                        " from "+simstatus[spec.status_section][spec.status_name].value);
                        }
                    });
                }
            });
    }

    function set_sim_control(spec)
    {
        {
            var json_obj = {};
            json_obj[spec.status_section] = {}
            json_obj[spec.status_section][spec.status_name] = {
                                            "name":spec.status_name,
                                            "value":spec.value};
            rest.postJson(apparatus_config.simulatorIP + '/update',
                          json_obj,
                          {timeout:60000})
                    .on('timeout', function(ms) {simulatorTimeout(ms, "update: "+spec.status_name);})
                    .on('complete', function(data, response)
                    {
                        data_is_OK(data, 'update');
                    });
        }
    }

    function simulatorTimeout(ms, tag)
    {
        if (_.isUndefined(tag)) tag = "";
        //console.log('Simulator timeout: '+tag+" after "+ms+' ms.');
        self.emit('timeout', "Simulator "+tag);
    }

    function simulatorError(msg, tag)
    {
        if (_.isUndefined(tag)) tag = "";
        //console.log('Simulator error: '+tag+': '+msg);
        self.emit('apparatus_error', tag+': '+msg);
    }

    function data_is_OK(data, tag, error_limit)
    {
        if (_.isUndefined(error_limit))
        {
            error_limit = 60;
        }
        if (data instanceof Error)
        {
            error_count += 1;
            if (error_count > error_limit) simulatorError(data.message, tag);
            return false;
        }
        else if (data.meta.response_code != 200)
        {
            error_count += 1;
            if (error_count > error_limit) simulatorError(data.meta.msg, tag);
            return false;
        }
        error_count = 0;
        return true;
    }


    // Public method: initialize the object
    self.begin = function()
    {
        var self = this;
        if(begun)
        {
            return;
        }

        begun = true;
        simstatus = {};

        // start the simulation monitor
        node330.logInfo("Starting simulation model '"+apparatus_config.simulatorModel+
                                              "' on "+apparatus_config.simulatorIP+'.');
        rest.postJson(apparatus_config.simulatorIP + '/load',
                      {'modelnm': apparatus_config.simulatorModel},
                      {timeout:120000})
            .on('timeout', function(ms) {simulatorTimeout(ms, 'load');})
            .on('complete', function(data, response)
            {
                if (data_is_OK(data, 'load', 0))
                {
                    rest.get(apparatus_config.simulatorIP + '/run',
                             {timeout:60000})
                    .on('timeout', function(ms) {simulatorTimeout(ms, 'run');})
                    .on('complete', function(data, response)
                    {
                        if (data_is_OK(data, 'run', 0))
                        {
                            connected = true;
                            node330.logInfo("Simulation model " +
                                            apparatus_config.simulatorModel +
                                            " is running.")
                            simstatusTimer = setInterval( getSimstatus, 1000);
                        }
                    });
                }
            });


        // initialize controls
        _.each(apparatus_config.controlMap, function(value, key, list) {
            var scale, valueType;
            if (_.isString(value[2]))
            {
                scale = 1.;
                value_type = node330_value_types.stringToValueType(value[2]);
                if (_.isUndefined(value_type))
                    console.log("***WARN*** Undefined value type: "+value[2]);
            }
            else
            {
                scale = value[2];
                value_type = node330_value_types.FRACTION;
            }
            controlValues[key] = {"control_name": key,
                                  "status_section": value[0],
                                  "status_name": value[1],
                                  "scale": scale,
                                  "valueType": value_type,
                                  "value": undefined};
            self.emit("new_control", key, value_type, 0);
        });
    }

    self.getSignalValue = function(signalName)
    {
        if(signalName in signalValues)
        {
            return signalValues[signalName].value;
        }

        return undefined;
    }

    self.getSignalValueType = function(signalName)
    {
        if(signalName in signalValues)
        {
            return signalValues[signalName].valueType;
        }

        return undefined;
    }

    self.setControlValue = function(controlName, value)
    {
        spec = controlValues[controlName];
        if (_.isUndefined(spec))
        {
            console.log("***WARN*** Control '"+controlName+"' is missing.");
            return undefined;
        }
        spec.value = parseFloat((value * spec.scale).toPrecision(4));

//        if (connected && !_.isUndefined(simstatus) && !_.isEmpty(simstatus)
//            && spec.value != simstatus[spec.status_section][spec.status_name])
//        {
//            set_sim_control(spec);
//        }
        return value;
    }

    self.restart = function()
    {
        self.end();

        setTimeout(function(){
            self.begin();
        }, 1000); // Give ourselves a second to restart
    }

    self.end = function()
    {
        // shut down the simulation
        if (!_.isUndefined(simstatusTimer)) clearInterval(simstatusTimer);
        connected = false;

        // with rest /stop and /unload actions.
        rest.get(apparatus_config.simulatorIP + '/stop', {timeout:60000})
        .on('timeout', function(ms) {simulatorTimeout(ms, 'stop');})
        .on('complete', function(data, response)
        {
            if (data_is_OK(data, 'stop'))
            {
                rest.get(apparatus_config.simulatorIP + '/unload', {timeout:60000})
                .on('timeout', function(ms) {simulatorTimeout(ms, 'unload');})
                .on('complete', function(data, response)
                {
                    data_is_OK(data, 'unload');
                });
            }
        });

        begun = false;

        if (!_.isUndefined(watchdogTimer)) clearInterval(watchdogTimer);

        signalValues = {};
        controlValues = {};
        simstatusTimer = undefined;
        watchdogTimer = undefined;
    }

    process.on('exit', function()
    {
        self.end();
    });
}

util.inherits(simulatorInterface, events.EventEmitter);

module.exports = simulatorInterface;