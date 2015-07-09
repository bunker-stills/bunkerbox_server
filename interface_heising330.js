var events = require('events');
var fs = require('fs');
var util = require('util');
var _ = require('underscore');
var node330_value_types = require("./node_modules/node330/lib/values330.js");
var mcp4922 = require("./build/Release/mcp4922");
var pcduino = require("pcduino");
var digital = pcduino.digital;
var spawn = require('child_process').spawn;
var readline = require('readline');
var ds18b20 = require("./build/Release/ds18b20");

// Rename the object 'signal' interface reflecting the fact that signals
// are bi-directional compared to sensors which are apparatus to program.
var signalInterface =  function(node330, apparatus_config)
{
    var self = this;

	var bmp085;

    var begun = false;
    var watchdogTimer;
    var sensorValues = {};
    // Controls are program to apparatus signals.
    var controlValues = {};

	var dacMapping = [
		{pin: 4, output: 1},
		{pin: 4, output: 0},
		{pin: 3, output: 1},
		{pin: 3, output: 0},
		{pin: 2, output: 1},
		{pin: 2, output: 0}
	];

    // Invert the sensorName sensorId mapping.
    // This simplifies hardware Id lookup.
    var sensorIdMap = {};
    _.each(apparatus_config.signalMap, function(value, key, list) {
        sensorIdMap[value] = key;
    });

    function updateSensorValue(sensorID, value, valueType)
    {
        var isNew = false;
        var sensorName = sensorIdMap[sensorID];

        if(!(sensorName in sensorValues))
        {
            sensorValues[sensorName] = {};
            isNew = true;
        }

        sensorValues[sensorName].lastUpdate = Date.now();
        sensorValues[sensorName].value = value;
        sensorValues[sensorName].valueType = valueType;
        sensorValues[sensorName].timeouts = 0;

        if(isNew)
        {
            self.emit('new_signal', sensorName, valueType);
        }
    }

    function poll1Wire()
    {
	    if(!begun)
	    {
		    return;
	    }

	    ds18b20.getTemps(function(temps)
	    {
		    _.each(temps, function(temp, probeID)
		    {
			    updateSensorValue(probeID, temp, node330_value_types.TEMP_IN_C);
                sensorValues[probeID].isDS18B20 = true;
		    });

		    setTimeout(poll1Wire, 1000);
	    });
    }

    // Switch polling moved from program to apparatus.
    // Elapsed time is new to parallel simulator time function.
    function pollFloatSwitch()
    {
        var pin = apprartus_config.getSectionSetting("signalMap", "floatSwitch_pin")
        setInterval(function() {
            updateSensorValue(pin, digital.digitalRead(pin), node330_value_types.SWITCH)
        }, 1000);
    }

    function pollElapsedTime()
    {
        var startTime = Date.now();
        setInterval(function()
        {
            updateSensorValue("ELAPSED_TIME",
                              (Date.now() - startTime),
                              node330_value_types.MILLISECONDS);
        }, 1000);
    }

    // Public method: initialize the object
    self.begin = function()
    {
        if(begun)
        {
            return;
        }

        begun = true;

        // Set our GPIO ports to serial
	    digital.pinMode(0, digital.SERIAL);
	    digital.pinMode(1, digital.SERIAL);

	    // Set all of our DAC CS's to HIGH so they won't accept commands.
	    _.each(dacMapping, function(mapping)
	    {
			digital.pinMode(mapping.pin, digital.OUTPUT);
		    digital.digitalWrite(mapping.pin, digital.HIGH);
	    });

	    // Enable our DACs
	    digital.pinMode(9, digital.OUTPUT);
	    digital.digitalWrite(9, digital.HIGH);

        // Controls are now associated with components and are set by the compoennt setValue function.
        // initialize controls
        _.each(apparatus_config.controlMap, function(value, key, list) {
            controlName = key;
            if(controlName in controlValues) continue;
            controlValues[controlName] = {};
            controlValues[controlName].dacChannel = value[0];
            controlValues[controlName].dacMin = value[1];
            controlValues[controlName].dacMax = value[2];
            controlValues[controlName].dacScale = value[3];
            // FRACTION is an arbitrary floating point value.
            emit("new_control", controlName, node330_value_types.FRACTION);
        });

        // Start polling functions
        pollFloatSwitch();
        pollElapsedTime();

	    // Spawn our BMP085 reader
	    bmp085 = spawn("python", ["-u", "./devices/bmp085/bmp085.py"]);

	    readline.createInterface({
		    input   : bmp085.stdout,
		    terminal: false
	    }).on('line', function(line)
		    {
			    try
			    {
					var data = JSON.parse(line);

				    updateSensorValue("AMB_PRESSURE", data.press / 100.0, node330_value_types.PRES_IN_MBAR);
				    updateSensorValue("AMB_TEMP", data.temp, node330_value_types.TEMP_IN_C);
			    }
			    catch(e)
			    {

			    }
		    });

	    ds18b20.begin(function()
	    {
		    poll1Wire();
	    });

        watchdogTimer = setInterval(function()
        {
            var now = Date.now();
	        digital.digitalWrite(9, digital.HIGH);

            var ds18b20Reconnecting = false;

            _.each(sensorValues, function(sensorValue, sensorName){

                var tDelta = now - sensorValue.lastUpdate;

                // Has it been greater than 10 seconds since we last saw this sensor?
                if(tDelta >= 10000)
                {
                    sensorValues[sensorName].timeouts++;

                    // If this is a DS18B20 sensor, try restarting the interface
                    if(sensorValues[sensorName].isDS18B20)
                    {
                        if(sensorValues[sensorName].timeouts >= 4) // If we've tried re-connecting 4 times and we still don't have a temperature, then we should timeout
                        {
                            sensorValues[sensorName].value = -17.78;
                            self.emit('timeout', sensorName);
                            delete sensorValues[sensorName];
                        }
                        else if(!ds18b20Reconnecting)
                        {
                            ds18b20Reconnecting = true;
                            node330.logWarning("Temp probe " + sensorName + " went offline. Trying to reconnect.");
                            ds18b20.resetConnection();
                        }
                    }
                    else
                    {
                        sensorValues[sensorName].value = 0;
                        self.emit('timeout', sensorName);
                        delete sensorValues[sensorName];
                    }
                }

            });
        }, 5000);
    }

    self.getSignalValue = function(sensorName)
    {
        if(sensorName in sensorValues)
        {
            return sensorValues[sensorName].value;
        }

        return undefined;
    }

	self.getSignalValueType = function(sensorName)
	{
		if(sensorName in sensorValues)
		{
			return sensorValues[sensorName].valueType;
		}

		return undefined;
	}

    // setControlValue is used to extend the physicalComponent with a setter function.
    self.setControlValue(controlName, value)
    {
        var ctrl = controlValues[controlName];
		if (_.isUndefined(ctrl)) return undefined;

        dacvalue = value==0 ? 0 : Math.round(ctrl.dacMin + value * ctrl.dacScale * (ctrl.dacMax - ctrl.dacMin));

        self.setDac(ctrl.dacChannel, dacvalue);
        return value;  // return the client value, not the transformed dacvalue.
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
        begun = false;

        clearInterval(watchdogTimer);

	    if(bmp085)
	    {
		    bmp085.kill();
            bmp085 = null;
	    }

        ds18b20.end();

        sensorValues = {};

	    // Disable our DACs
	    digital.digitalWrite(9, digital.LOW);
    }

	self.setDAC = function(dacNumber, value)
	{
    	// Starting DAC number is 1
		var dacInfo = dacMapping[dacNumber - 1];

        // Clamp value between 0 and 4095
        value = Math.max(0, Math.min(value, 4095));

		mcp4922.setDAC(dacInfo.pin, dacInfo.output, value);
	}

	process.on('exit', function()
	{
		self.end();
	});
}

util.inherits(signalInterface, events.EventEmitter);

module.exports = signalInterface;
