var mcp4922 = require("./build/Release/mcp4922");
var fs = require("fs");
var pcduino = require("pcduino");
var digital = pcduino.digital;
var running = require('is-running');

var DAC_ENABLE_PIN = 9;
var TIMEOUT_IN_MS = 5000;
var TIMEOUT_COUNT_MAX = 3;

var inFailsafe = false;
var timeoutCount = 0;

var dacMapping = [
	{pin: 4, output: 1},
	{pin: 4, output: 0},
	{pin: 3, output: 1},
	{pin: 3, output: 0},
	{pin: 2, output: 1},
	{pin: 2, output: 0}
];

function goFailsafe()
{
	// Set all of our DACs to zero
	try
	{
		for(var index = 0; index < dacMapping.length; index++)
		{
			var dacInfo = dacMapping[index];
			mcp4922.setDAC(dacInfo.pin, dacInfo.output, 0);
		}
	}
	catch(e)
	{

	}

	// Set GPIO pin 9 to LOW: This should shutdown our DACs
	digital.pinMode(DAC_ENABLE_PIN, digital.OUTPUT);
	digital.digitalWrite(DAC_ENABLE_PIN, digital.LOW);

	if(inFailsafe)
	{
		return;
	}

	inFailsafe = true;

	var date = new Date();
	console.log("Watchdog went to failsafe at: " + date.toLocaleString());
}

var timeout = setInterval(function(){

	fs.readFile("./bunkerbox.pid", function(err, data)
	{
		try
		{
			if(err)
			{
				goFailsafe();
				return;
			}

			var pid = Number(data);

			if(!running(pid))
			{
				goFailsafe();
				return;
			}

			if(inFailsafe)
			{
				var date = new Date();
				console.log("Watchdog emerged from failsafe at " + date.toLocaleString());
			}

			inFailsafe = false;
            timeoutCount = 0;
		}
		catch(e)
		{
			console.log("Watchdog Error: " + e.toString());
			goFailsafe();
		}
	});

}, 5000);